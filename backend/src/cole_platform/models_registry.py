"""Import every module's models so SQLAlchemy metadata is complete."""
from cole_platform.modules.catalog import models as _catalog  # noqa: F401
from cole_platform.modules.identity import models as _identity  # noqa: F401
from cole_platform.modules.syllabus_import import models as _syllabus  # noqa: F401
from cole_platform.modules.assignments import models as _assignments  # noqa: F401
from cole_platform.modules.workspaces import models as _workspaces  # noqa: F401
from cole_platform.modules.submissions import models as _submissions  # noqa: F401

try:
    from cole_platform.modules.runs import models as _runs  # noqa: F401
    from cole_platform.modules.plugins import models as _plugins  # noqa: F401
except ImportError:
    pass

try:
    from cole_platform.modules.evaluations import models as _evaluations  # noqa: F401
    from cole_platform.modules.llm_gateway import models as _llm  # noqa: F401
except ImportError:
    pass
