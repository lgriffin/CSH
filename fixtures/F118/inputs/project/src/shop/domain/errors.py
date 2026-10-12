class DomainError(ValueError):
    """Raised when an order breaks a rule of the domain."""


class OrderNotFound(DomainError):
    pass
