class PaginationError(ValueError):
    """Base class for incomplete paginated results."""


class PaginationLimitReached(PaginationError):
    """Raised when a paginated Letterboxd collection exceeds its safety cap."""


class PaginationStalled(PaginationError):
    """Raised when a paginated source repeats a page or stops advancing."""

