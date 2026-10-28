from collections.abc import Iterator
from contextlib import contextmanager
from sqlite3 import Connection as SqliteConnection

from sqlalchemy import Connection, Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import ConnectionPoolEntry


def make_engine(url: str, begin_sql: str) -> Engine:
    engine = create_engine(
        url,
        connect_args={"check_same_thread": False, "timeout": 5},
        hide_parameters=True,
    )

    @event.listens_for(engine, "connect")
    def on_connect(connection: SqliteConnection, _record: ConnectionPoolEntry) -> None:
        connection.isolation_level = None
        cursor = connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys = ON")
            cursor.execute("PRAGMA journal_mode = WAL")
            cursor.execute("PRAGMA busy_timeout = 5000")
            cursor.execute("PRAGMA synchronous = NORMAL")
        finally:
            cursor.close()

    @event.listens_for(engine, "begin")
    def on_begin(connection: Connection) -> None:
        connection.exec_driver_sql(begin_sql)

    return engine


class Db:
    def __init__(self, url: str) -> None:
        self._read_engine = make_engine(url, "BEGIN")
        self._write_engine = make_engine(url, "BEGIN IMMEDIATE")
        self._read_sessions = sessionmaker(
            self._read_engine, expire_on_commit=False, autobegin=False
        )
        self._write_sessions = sessionmaker(
            self._write_engine, expire_on_commit=False, autobegin=False
        )

    @contextmanager
    def read(self) -> Iterator[Session]:
        with self._read_sessions() as session, session.begin():
            yield session

    @contextmanager
    def write(self) -> Iterator[Session]:
        with self._write_sessions() as session, session.begin():
            yield session

    @property
    def write_engine(self) -> Engine:
        return self._write_engine

    def dispose(self) -> None:
        self._read_engine.dispose()
        self._write_engine.dispose()
