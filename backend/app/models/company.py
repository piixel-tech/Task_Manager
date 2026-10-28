from beanie import Document


class Company(Document):
    name: str

    class Settings:
        name = "companies"
