import json
import logging
from contextlib import contextmanager
from typing import Any, Optional

from open_webui.internal.wrappers import register_connection
from open_webui.env import (
    OPEN_WEBUI_DIR,
    DATABASE_URL,
    DATABASE_SCHEMA,
    SRC_LOG_LEVELS,
    DATABASE_POOL_MAX_OVERFLOW,
    DATABASE_POOL_RECYCLE,
    DATABASE_POOL_SIZE,
    DATABASE_POOL_TIMEOUT,
)
from peewee_migrate import Router
from sqlalchemy import Dialect, create_engine, MetaData, types
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.pool import QueuePool, NullPool
from sqlalchemy.sql.type_api import _T
from typing_extensions import Self

# 임시 로깅 추가
logging.basicConfig(level=logging.INFO) # 이미 설정되어 있다면 중복 불필요
logger_db_config = logging.getLogger("DB_CONFIG_CHECK")
logger_db_config.info(f"DATABASE_URL being used by db.py: {DATABASE_URL}")

log = logging.getLogger(__name__)
log.setLevel(SRC_LOG_LEVELS["DB"])


class JSONField(types.TypeDecorator):
    impl = types.Text
    cache_ok = True

    def process_bind_param(self, value: Optional[_T], dialect: Dialect) -> Any:
        return json.dumps(value)

    def process_result_value(self, value: Optional[_T], dialect: Dialect) -> Any:
        if value is not None:
            return json.loads(value)

    def copy(self, **kw: Any) -> Self:
        return JSONField(self.impl.length)

    def db_value(self, value):
        return json.dumps(value)

    def python_value(self, value):
        if value is not None:
            return json.loads(value)


# Workaround to handle the peewee migration
# This is required to ensure the peewee migration is handled before the alembic migration
def handle_peewee_migration(DATABASE_URL):
    # db = None
    try:
        # Replace the postgresql:// with postgres:// to handle the peewee migration
        db = register_connection(DATABASE_URL.replace("postgresql://", "postgres://"))
        migrate_dir = OPEN_WEBUI_DIR / "internal" / "migrations"
        router = Router(db, logger=log, migrate_dir=migrate_dir)
        router.run()
        db.close()

    except Exception as e:
        log.error(f"Failed to initialize the database connection: {e}")
        raise
    finally:
        # Properly closing the database connection
        if db and not db.is_closed():
            db.close()

        # Assert if db connection has been closed
        assert db.is_closed(), "Database connection is still open."


handle_peewee_migration(DATABASE_URL)


SQLALCHEMY_DATABASE_URL = DATABASE_URL
if "sqlite" in SQLALCHEMY_DATABASE_URL:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
    )
else:
    if DATABASE_POOL_SIZE > 0:
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            pool_size=DATABASE_POOL_SIZE,
            max_overflow=DATABASE_POOL_MAX_OVERFLOW,
            pool_timeout=DATABASE_POOL_TIMEOUT,
            pool_recycle=DATABASE_POOL_RECYCLE,
            pool_pre_ping=True,
            poolclass=QueuePool,
        )
    else:
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL, pool_pre_ping=True, poolclass=NullPool
        )


SessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=engine, expire_on_commit=False
)
metadata_obj = MetaData(schema=DATABASE_SCHEMA)
Base = declarative_base(metadata=metadata_obj)

# SQLAlchemy Base를 사용하는 모든 모델에 대한 테이블을 생성합니다.
# 데이터베이스가 연결되어 있고 (예: engine이 None이 아님),
# 해당 테이블이 아직 존재하지 않는 경우에만 테이블이 생성됩니다.
# 프로덕션 환경이나 복잡한 스키마 변경 관리에는 Alembic과 같은
# 마이그레이션 도구를 사용하는 것이 권장됩니다.
if engine:
    try:
        Base.metadata.create_all(bind=engine)
        log.info("SQLAlchemy models' tables created successfully or already exist.")
    except Exception as e:
        log.error(f"Error creating SQLAlchemy models' tables: {e}")

Session = scoped_session(SessionLocal)


def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


get_db = contextmanager(get_session)
