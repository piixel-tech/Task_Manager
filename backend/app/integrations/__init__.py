"""Connected apps. Providers register themselves here; the router and the scheduler only talk to the registry."""
from app.integrations import registry
from app.integrations.google.provider import GoogleCalendarProvider

registry.register(GoogleCalendarProvider())
