"""Import every module's models so SQLAlchemy metadata is complete."""
from cole_platform.modules.catalog import models as _catalog  # noqa: F401
from cole_platform.modules.identity import models as _identity  # noqa: F401
from cole_platform.modules.syllabus_import import models as _syllabus  # noqa: F401
