from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.core.deps import get_current_user, require_role
from app.models import Company, Project, User
from app.schemas.user import CompanyOut

router = APIRouter(prefix="/companies", tags=["companies"], dependencies=[Depends(get_current_user)])


class CompanyBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("must not be empty")
        return v


async def _unique(name: str, except_id: PydanticObjectId | None = None) -> None:
    for c in await Company.find_all().to_list():
        if c.name.lower() == name.lower() and c.id != except_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "A company with that name already exists")


async def _get(company_id: PydanticObjectId) -> Company:
    company = await Company.get(company_id)
    if company is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    return company


@router.get("", response_model=list[CompanyOut])
async def list_companies() -> list[Company]:
    return await Company.find_all().sort("+name").to_list()


@router.post("", response_model=CompanyOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_role("admin"))])
async def create_company(body: CompanyBody) -> Company:
    await _unique(body.name)
    return await Company(name=body.name).insert()


@router.patch("/{company_id}", response_model=CompanyOut, dependencies=[Depends(require_role("admin"))])
async def rename_company(company_id: PydanticObjectId, body: CompanyBody) -> Company:
    company = await _get(company_id)
    await _unique(body.name, company.id)
    company.name = body.name
    return await company.save()


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_role("admin"))])
async def delete_company(company_id: PydanticObjectId) -> None:
    """Only a company nobody belongs to: people and projects keep pointing at it, so it has to be empty first."""
    company = await _get(company_id)
    people = await User.find(User.company_id == company.id).count()
    projects = await Project.find(Project.company_id == company.id).count()
    if people or projects:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{company.name} still has {people} {'person' if people == 1 else 'people'} and {projects} project{'' if projects == 1 else 's'}. Move them first.",
        )
    await company.delete()
