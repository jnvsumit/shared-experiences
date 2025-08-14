Shared Experiences

Vision
- A simple, anonymous platform where people can share a personal experience and instantly see how many others have gone through something similar. This fosters connection and validation.

Target Audience
- Anyone with an internet connection who wants to share a thought, feeling, or event and feel less alone.

Core Flow
1) User lands on homepage
2) Types an experience and posts
3) System categorizes with LLM, finds similar experiences, shows counts and examples immediately

Key Features
- Anonymous posting (no accounts)
- LLM-powered categorization (themes, sentiment, summary)
- Semantic similarity and grouping (embeddings + clustering)
- Trending experiences (last 24h)
- Grouped summaries with counts
- Optional Neo4j graph layer for similarity edges

LLM & Tech
- MERN (MongoDB, Express, React, Node)
- DeepSeek preferred; OpenAI fallback
- Local NLP fallback for resilience
- Embeddings + cosine similarity, k-means clustering
- Anonymous sessions via HTTP-only cookie; IP + fingerprint hashed

Future
- Keep v1 focused on core loop; filtering and advanced features can follow

Production deployment (one command)

Prereqs
- Docker and Docker Compose installed

Steps
1) Copy env template and edit values
   cp .env.example .env
   # edit .env to set API keys and origins

2) Start everything
   make up

Services
- Frontend: http://localhost:5173
- Backend API: http://localhost:4000
- MongoDB: localhost:27017
- Neo4j (optional): http://localhost:7474 (bolt: localhost:7687)

Common
- Rebuild: make build
- Logs: make logs
- Stop: make down


