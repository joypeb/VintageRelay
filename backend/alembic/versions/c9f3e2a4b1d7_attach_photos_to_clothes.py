"""attach photos to clothes

Revision ID: c9f3e2a4b1d7
Revises: bf5a4ccaa2c0
Create Date: 2026-10-30

"""

import sqlalchemy as sa
from sqlalchemy import text

from alembic import op

# Revision identifiers, used by Alembic.
revision: str = "c9f3e2a4b1d7"
down_revision: str | None = "bf5a4ccaa2c0"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    """Apply the schema change."""
    with op.batch_alter_table("photos") as batch_op:
        batch_op.add_column(sa.Column("clothing_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("position", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            op.f("fk_photos_clothing_id_clothes"),
            "clothes",
            ["clothing_id"],
            ["id"],
        )
        batch_op.create_unique_constraint(
            op.f("uq_photos_clothing_id"), ["clothing_id", "position"]
        )
    op.execute(
        text(
            "UPDATE photos SET clothing_id = "
            "(SELECT id FROM clothes WHERE clothes.photo_id = photos.id), "
            "position = 0 WHERE EXISTS "
            "(SELECT 1 FROM clothes WHERE clothes.photo_id = photos.id)"
        )
    )
    with op.batch_alter_table("clothes") as batch_op:
        batch_op.drop_constraint(op.f("fk_clothes_photo_id_photos"), type_="foreignkey")
        batch_op.drop_constraint(op.f("uq_clothes_photo_id"), type_="unique")
        batch_op.drop_column("photo_id")


def downgrade() -> None:
    """Revert the schema change."""
    with op.batch_alter_table("clothes") as batch_op:
        batch_op.add_column(sa.Column("photo_id", sa.String(length=36), nullable=True))
    op.execute(
        text(
            "UPDATE clothes SET photo_id = "
            "(SELECT id FROM photos WHERE photos.clothing_id = clothes.id "
            "AND photos.position = 0)"
        )
    )
    with op.batch_alter_table("clothes") as batch_op:
        batch_op.alter_column("photo_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.create_foreign_key(
            op.f("fk_clothes_photo_id_photos"), "photos", ["photo_id"], ["id"]
        )
        batch_op.create_unique_constraint(op.f("uq_clothes_photo_id"), ["photo_id"])
    with op.batch_alter_table("photos") as batch_op:
        batch_op.drop_constraint(op.f("uq_photos_clothing_id"), type_="unique")
        batch_op.drop_constraint(op.f("fk_photos_clothing_id_clothes"), type_="foreignkey")
        batch_op.drop_column("clothing_id")
        batch_op.drop_column("position")
