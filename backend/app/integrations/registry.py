from app.integrations.base import Provider

_providers: dict[str, Provider] = {}


def register(provider: Provider) -> Provider:
    _providers[provider.key] = provider
    return provider


def get(key: str) -> Provider | None:
    return _providers.get(key)


def all_providers() -> list[Provider]:
    return list(_providers.values())
