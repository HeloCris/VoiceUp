"""Seed Firestore with LinguaTown chapters and missions."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from google.cloud import firestore


CHAPTERS: List[Dict[str, Any]] = [
    {
        "id": "chapter-1",
        "title": "Welcome to LinguaTown!",
        "scenario": "Airport immigration",
        "order": 1,
        "level": "basic",
    },
    {
        "id": "chapter-2",
        "title": "Finding Your Way",
        "scenario": "Asking for transportation directions",
        "order": 2,
        "level": "basic",
    },
    {
        "id": "chapter-3",
        "title": "Checking In at the Hotel",
        "scenario": "Hotel front desk check-in",
        "order": 3,
        "level": "intermediate",
    },
]

MISSIONS: List[Dict[str, Any]] = [
    {
        "id": "mission-1-1",
        "chapterId": "chapter-1",
        "title": "Immigration greeting",
        "description": "Introduce yourself and your travel purpose.",
        "order": 1,
        "level": "basic",
        "languageCode": "en-US",
        "keywords": ["passport", "visit", "tourism", "business"],
        "prompts": [
            {
                "id": "p-1",
                "text": "Welcome to LinguaTown. What is your name and why are you visiting?",
                "audioUri": None,
            }
        ],
    },
    {
        "id": "mission-1-2",
        "chapterId": "chapter-1",
        "title": "Length of stay",
        "description": "Explain how long you will stay and where you will go.",
        "order": 2,
        "level": "basic",
        "languageCode": "en-US",
        "keywords": ["days", "week", "hotel", "city"],
        "prompts": [
            {
                "id": "p-2",
                "text": "How long will you stay and where will you be lodging?",
                "audioUri": None,
            }
        ],
    },
    {
        "id": "mission-2-1",
        "chapterId": "chapter-2",
        "title": "Finding transport",
        "description": "Ask about buses, trains, or taxis.",
        "order": 1,
        "level": "basic",
        "languageCode": "en-US",
        "keywords": ["bus", "train", "station", "ticket"],
        "prompts": [
            {
                "id": "p-3",
                "text": "How can I get to the city center using public transport?",
                "audioUri": None,
            }
        ],
    },
    {
        "id": "mission-2-2",
        "chapterId": "chapter-2",
        "title": "Clarifying directions",
        "description": "Ask for directions and confirm the route.",
        "order": 2,
        "level": "basic",
        "languageCode": "en-US",
        "keywords": ["turn", "left", "right", "stop"],
        "prompts": [
            {
                "id": "p-4",
                "text": "Could you repeat the directions and confirm the stop?",
                "audioUri": None,
            }
        ],
    },
    {
        "id": "mission-3-1",
        "chapterId": "chapter-3",
        "title": "Check-in request",
        "description": "Request a room and share reservation details.",
        "order": 1,
        "level": "intermediate",
        "languageCode": "en-US",
        "keywords": ["reservation", "room", "nights", "booking"],
        "prompts": [
            {
                "id": "p-5",
                "text": "Hello, I have a reservation. Can I check in, please?",
                "audioUri": None,
            }
        ],
    },
    {
        "id": "mission-3-2",
        "chapterId": "chapter-3",
        "title": "Hotel preferences",
        "description": "Ask about room preferences and amenities.",
        "order": 2,
        "level": "intermediate",
        "languageCode": "en-US",
        "keywords": ["breakfast", "wifi", "quiet", "floor"],
        "prompts": [
            {
                "id": "p-6",
                "text": "Do you have a quiet room with Wi-Fi and breakfast included?",
                "audioUri": None,
            }
        ],
    },
]


def seed() -> None:
    client = firestore.Client()
    now = datetime.utcnow().isoformat() + "Z"

    for chapter in CHAPTERS:
        chapter_ref = client.collection("chapters").document(chapter["id"])
        chapter_ref.set(
            {
                **chapter,
                "status": "active",
                "createdAt": now,
                "updatedAt": now,
            },
            merge=True,
        )

    for mission in MISSIONS:
        mission_ref = client.collection("missions").document(mission["id"])
        mission_ref.set(
            {
                **mission,
                "status": "active",
                "createdAt": now,
                "updatedAt": now,
            },
            merge=True,
        )

    print("Seeded chapters and missions.")


if __name__ == "__main__":
    seed()
