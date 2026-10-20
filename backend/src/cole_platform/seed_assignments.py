"""Seed hook: import every assignment package under content/assignments (idempotent)."""
from sqlalchemy.orm import Session

from cole_platform.modules.assignments.package import import_all


def seed_assignments(db: Session) -> None:
    for line in import_all(db):
        print(f"  assignment: {line}")
