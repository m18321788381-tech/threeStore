"""迁移脚本与 ORM 模型的一致性校验（**不需要数据库**）。

为什么值得单独钉住：
    本项目本机没有 Docker / PostgreSQL，`alembic upgrade head` 无法在提交阶段真跑，
    于是「模型加了列但忘了写迁移」这类错误只能等到部署到服务器才暴露 ——
    而那时通常表现为线上 500（列不存在），排查成本远高于写这个测试。

做法：
    用假的 `op` 模块执行迁移脚本，把 DDL 操作录下来，再与 `Base.metadata` 双向对照：
      - 迁移新增/删除的列，模型必须对应存在/不存在；
      - 迁移建的索引，模型的列组合里必须有（按「列组合」比对而非索引名）；
      - 反向 1：模型里声明的每一列，必须有某个迁移负责创建它；
      - 反向 2：模型里声明的每一个索引，必须有某个迁移真的建了它；
      - 新增 NOT NULL 列必须带 server_default，否则升级线上非空表会直接失败。
    反向的两条是核心 —— 它们专门抓「只改模型、不写迁移」的漂移。

这个测试已经真抓到过三处漂移（都不是测试写错，是代码真不一致）：
    1. posts.canonical_url 模型是 NOT NULL，迁移写成了 nullable=True；
    2. post_links 的索引名与迁移不符，且在 target_post_id 上叠了一条重复索引；
    3. posts.status 模型声明了 index=True，但迁移从未建过该索引（复合索引已覆盖）。
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Any

import sqlalchemy as sa

from app.models import Base

VERSIONS_DIR = Path(__file__).resolve().parent.parent / "alembic" / "versions"


class _OpRecorder:
    """记录迁移脚本调用过的 DDL 操作，替代真实的 alembic `op`。"""

    def __init__(self) -> None:
        self.added_columns: list[tuple[str, sa.Column]] = []
        self.dropped_columns: list[tuple[str, str]] = []
        self.created_indexes: list[tuple[str, str, tuple[str, ...], bool]] = []
        # {表名: {列名: 是否列级 UNIQUE}}
        self.created_tables: dict[str, dict[str, bool]] = {}
        self.dropped_tables: list[str] = []
        self.unique_constraints: list[tuple[str, str, tuple[str, ...]]] = []
        self.raw_sql: list[str] = []
        # 未被显式建模的操作（如 alter_column）只记录，不阻断 —— 迁移脚本新增
        # 操作类型时不应该让这个测试变成"必须先改测试"的负担
        self.other_ops: list[str] = []

    def __getattr__(self, name: str):
        def _passthrough(*_args: Any, **_kw: Any) -> None:
            self.other_ops.append(name)

        return _passthrough

    # ---------------------------------------------------------- 被调用的接口 ---
    def add_column(self, table_name: str, column: sa.Column, **_kw: Any) -> None:
        self.added_columns.append((table_name, column))

    def drop_column(self, table_name: str, column_name: str, **_kw: Any) -> None:
        self.dropped_columns.append((table_name, column_name))

    def create_index(
        self,
        index_name: str,
        table_name: str,
        columns: list[str],
        unique: bool = False,
        **_kw: Any,
    ) -> None:
        self.created_indexes.append(
            (index_name, table_name, tuple(columns), bool(unique))
        )

    def create_unique_constraint(
        self, name: str, table_name: str, columns: list[str], **_kw: Any
    ) -> None:
        self.unique_constraints.append((name, table_name, tuple(columns)))

    def create_table(self, table_name: str, *args: Any, **_kw: Any) -> None:
        self.created_tables[table_name] = {
            arg.name: bool(getattr(arg, "unique", False))
            for arg in args
            if isinstance(arg, sa.Column)
        }

    def drop_table(self, table_name: str, **_kw: Any) -> None:
        self.dropped_tables.append(table_name)

    def drop_index(self, *_args: Any, **_kw: Any) -> None:
        pass

    def execute(self, statement: Any, **_kw: Any) -> None:
        self.raw_sql.append(str(statement))

    # ------------------------------------------------------------- 派生视图 ---
    def enforced_unique(self) -> set[tuple[str, tuple[str, ...]]]:
        """迁移实际保证了唯一性的 (表, 列组合) 集合。

        同一件事在 PG 里有三种表达：列级 UNIQUE、独立唯一约束、唯一索引。
        `users.username` 就是典型 —— 模型声明成 unique index，而 0001 用的是列级
        UNIQUE，两者名字不同但语义等价。所以这里归一到「列组合」再比较，
        只断言语义，不去对齐 DDL 的书写形式。
        """
        combos: set[tuple[str, tuple[str, ...]]] = {
            (table, columns) for _name, table, columns in self.unique_constraints
        }
        combos |= {
            (table, (column,))
            for table, columns in self.created_tables.items()
            for column, is_unique in columns.items()
            if is_unique
        }
        combos |= {
            (table, columns) for _name, table, columns, unique in self.created_indexes if unique
        }
        return combos


def _load_migration(module_path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(module_path.stem, module_path)
    assert spec and spec.loader, f"无法加载迁移脚本：{module_path}"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_all_upgrades() -> _OpRecorder:
    """按 revision 顺序执行全部 upgrade()，返回累积的 DDL 记录。"""
    paths = sorted(VERSIONS_DIR.glob("[0-9]*.py"))
    assert paths, "没有找到任何迁移脚本"
    recorder = _OpRecorder()
    for path in paths:
        module = _load_migration(path)
        # 迁移脚本在模块级 `from alembic import op`，替换模块属性即可接管
        module.op = recorder  # type: ignore[attr-defined]
        module.upgrade()
    return recorder


def test_migration_added_columns_exist_in_models():
    """迁移新增的列，模型里必须存在，且可空性与类型一致。"""
    recorder = _run_all_upgrades()
    for table_name, column in recorder.added_columns:
        table = Base.metadata.tables.get(table_name)
        assert table is not None, f"迁移里出现了模型中没有的表：{table_name}"
        assert column.name in table.columns, (
            f"{table_name}.{column.name} 由迁移新增，但模型里没有该列"
        )
        model_column = table.columns[column.name]
        assert model_column.nullable == column.nullable, (
            f"{table_name}.{column.name} 可空性不一致："
            f"模型={model_column.nullable} 迁移={column.nullable}"
        )
        assert str(model_column.type) == str(column.type), (
            f"{table_name}.{column.name} 类型不一致："
            f"模型={model_column.type} 迁移={column.type}"
        )


def test_migration_dropped_columns_absent_from_models():
    """迁移删除的列不能在模型里残留。"""
    recorder = _run_all_upgrades()
    for table_name, column_name in recorder.dropped_columns:
        table = Base.metadata.tables.get(table_name)
        if table is None:
            continue
        assert column_name not in table.columns, (
            f"{table_name}.{column_name} 已被迁移删除，但模型里仍然保留"
        )


def test_migration_created_tables_and_indexes_match_models():
    recorder = _run_all_upgrades()

    for table_name in recorder.created_tables:
        assert table_name in Base.metadata.tables, (
            f"迁移创建了表 {table_name}，但模型里没有定义"
        )
    for table_name in recorder.dropped_tables:
        assert table_name not in Base.metadata.tables, (
            f"迁移删除了表 {table_name}，但模型里仍然定义着"
        )

    # --------------------------------------------------- 索引：双向按「列组合」比对 ---
    # 为什么不按索引名比对：同一份索引在 PG 里有三种等价写法（列级 UNIQUE、
    # 独立唯一约束、唯一索引），迁移与模型各选一种就会名字不同、语义相同
    # （`users.username` 就是这种）。按名字比会把这类无害差异报成错误，
    # 逼人为了"过测试"去改本来正确的一侧。所以只断言语义。
    model_indexes: dict[tuple[str, tuple[str, ...]], str] = {
        (table.name, tuple(column.name for column in index.columns)): index.name
        for table in Base.metadata.sorted_tables
        for index in table.indexes
    }

    # 方向一：迁移建了索引，模型的列组合里必须有对应项
    for index_name, table_name, columns, _unique in recorder.created_indexes:
        assert table_name in Base.metadata.tables, (
            f"索引 {index_name} 指向不存在的表 {table_name}"
        )
        assert (table_name, columns) in model_indexes, (
            f"迁移创建了 {table_name}{columns} 上的索引 {index_name}，"
            f"但模型里没有声明同列组合的索引"
        )
        # 万一模型里恰好有同名索引，则列必须一致 —— 防的是"名字撞车但内容不同"
        same_name = [
            index
            for index in Base.metadata.tables[table_name].indexes
            if index.name == index_name
        ]
        if same_name:
            assert tuple(col.name for col in same_name[0].columns) == columns, (
                f"索引 {index_name} 同名但列不一致："
                f"模型={tuple(c.name for c in same_name[0].columns)} 迁移={columns}"
            )

    # 方向二：模型声明的索引，迁移必须真的建了 —— 抓「只改模型、忘了写迁移」
    migration_surface = {
        (table, columns) for _n, table, columns, _u in recorder.created_indexes
    } | recorder.enforced_unique()
    undeclared = sorted(set(model_indexes) - migration_surface)
    assert not undeclared, (
        "模型声明了索引但没有任何迁移创建它："
        + ", ".join(
            f"{table}{columns}({model_indexes[(table, columns)]})"
            for table, columns in undeclared
        )
    )

    # ------------------------------------------- 唯一性：模型声明的必须是真被保证的 ---
    enforced = recorder.enforced_unique()
    claimed: set[tuple[str, tuple[str, ...]]] = set()
    for table in Base.metadata.sorted_tables:
        claimed |= {
            (table.name, tuple(col.name for col in index.columns))
            for index in table.indexes
            if index.unique
        }
        claimed |= {
            (table.name, tuple(col.name for col in constraint.columns))
            for constraint in table.constraints
            if isinstance(constraint, sa.UniqueConstraint)
        }

    missing = sorted(claimed - enforced)
    assert not missing, (
        "模型声明了唯一性但迁移没有落实：" + ", ".join(f"{t}{c}" for t, c in missing)
    )


def test_added_not_null_columns_carry_server_default():
    """给**已存在**的表新增 NOT NULL 列时，迁移必须带 server_default。

    这条防的是一类只在生产才会炸的错误：
        `op.add_column("posts", sa.Column("x", ..., nullable=False))` 在空表上没事，
        但线上 posts 已有数据 → `alembic upgrade head` 直接失败
        （column "x" of relation "posts" contains null values），
        而此时通常已经在发布窗口里，回滚成本很高。
        带 server_default，存量行才有值可回填。
    """
    recorder = _run_all_upgrades()
    problems: list[str] = []
    for table_name, column in recorder.added_columns:
        if column.nullable:
            continue
        if column.server_default is None:
            problems.append(f"{table_name}.{column.name} 是 NOT NULL 但迁移没给 server_default")
    assert not problems, "新增 NOT NULL 列缺少 server_default：\n  - " + "\n  - ".join(problems)


def test_every_model_column_is_created_by_some_migration():
    """反向校验（核心）：模型里每一列都必须有迁移负责创建。

    这条专门抓「只改模型、忘了写迁移」—— 该错误在本机无法通过 `alembic upgrade`
    暴露，却会在服务器上以「列不存在」的 500 形式出现。
    """
    recorder = _run_all_upgrades()
    problems: list[str] = []

    for table in Base.metadata.sorted_tables:
        declared: set[str] = set(recorder.created_tables.get(table.name, []))
        declared |= {
            column.name
            for added_table, column in recorder.added_columns
            if added_table == table.name
        }
        declared -= {
            column_name
            for dropped_table, column_name in recorder.dropped_columns
            if dropped_table == table.name
        }
        if not declared:
            problems.append(f"表 {table.name} 没有任何迁移创建它")
            continue
        missing = sorted(set(table.columns.keys()) - declared)
        if missing:
            problems.append(f"表 {table.name} 的列 {missing} 在模型里存在但没有迁移创建")

    assert not problems, "模型与迁移不一致：\n  - " + "\n  - ".join(problems)
