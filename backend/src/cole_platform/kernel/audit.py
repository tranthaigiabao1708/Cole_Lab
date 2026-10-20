from sqlalchemy.orm import Session

from .ids import new_id


def audit(db: Session, action: str, actor_id: str | None = None, target_type: str | None = None,
          target_id: str | None = None, actor_type: str = "user", meta: dict | None = None,
          ip: str | None = None, commit: bool = False) -> None:
    """Append an audit record. Never store secrets in `meta`."""
    from cole_platform.modules.identity.models import AuditLog

    db.add(AuditLog(id=new_id("aud"), actor_id=actor_id, actor_type=actor_type, action=action,
                    target_type=target_type, target_id=target_id, meta=meta or {}, ip=ip))
    if commit:
        db.commit()
