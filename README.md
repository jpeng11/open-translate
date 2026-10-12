# Open Translate

Connect Immersive Translate to your own OpenAI-compatible local or hosted AI endpoint. The extension handles webpage selection and bilingual rendering; Open Translate adapts its Custom API requests into Chat Completions requests to your agent.

This is an independent implementation of the documented integration contract. It does not contain Immersive Translate's compiled bundles or source.

The bridge and connection tests are being implemented in this repository. Python 3.10+ is the only runtime requirement; there are no third-party runtime dependencies.

Protocol references: [Immersive Translate Custom API](https://immersivetranslate.com/en/docs/services/custom/), [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
