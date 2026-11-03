from app.schemas.common import ApiModel


class Proposal(ApiModel):
    id: str
    status: str
    version: int
