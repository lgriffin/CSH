import pydantic


class OrderRecord(pydantic.BaseModel):
    id: str
    total: int
