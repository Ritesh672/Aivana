# the model catalog the frontend's model menu is built from
from fastapi import APIRouter

import llm_service as llm
from deps import is_free_provider

router = APIRouter(prefix="/api", tags=["models"])


@router.get("/models")
def list_models():
    models, seen_providers = [], set()
    for model_id, m in llm.ALLOWED_MODELS.items():
        provider = llm.provider_of(model_id)
        models.append({
            "id": model_id,
            "label": m["label"],
            "provider": provider,
            "provider_label": llm.PROVIDERS[provider]["label"],
            "provider_short": llm.PROVIDERS[provider]["short"],
            "featured": model_id in llm.FEATURED_MODELS,
            # the catalog lists each company's newest model first; only
            # featured (tested, current) models get the badge
            "latest": provider not in seen_providers and model_id in llm.FEATURED_MODELS,
            "free": is_free_provider(provider),
        })
        seen_providers.add(provider)
    return {
        "default": llm.DEFAULT_MODEL,
        # the frontend picks a user's model from these: their best paid
        # company if they have a key, otherwise the free default
        "free_default": llm.FREE_DEFAULT_MODEL if is_free_provider("huggingface") else None,
        "provider_defaults": llm.PROVIDER_DEFAULTS,
        "paid_preference": llm.PAID_PREFERENCE,
        "models": models,
    }
