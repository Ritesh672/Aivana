# terminal chat: pick a model and talk to it using the keys in .env
# run from the backend folder: python cli.py
import asyncio

import llm_service as llm

EXIT_COMMANDS = {"quit", "quits", "exit"}


def choose_model():
    options = ", ".join(llm.ALLOWED_MODELS)
    while True:
        choice = input(f"Choose a model [{options}]: ").strip().lower()
        if choice in llm.ALLOWED_MODELS:
            return choice
        print(f"'{choice}' is not a valid option, try again.")


async def main():
    model_id = choose_model()
    api_key = llm.server_key(llm.provider_of(model_id))

    # memory: the conversation so far, sent to the model on every turn
    history = []

    print("Start chatting! Type 'quit' to end the conversation.\n")

    while True:
        user_input = input("You: ").strip()

        if not user_input:
            continue
        if user_input.lower() in EXIT_COMMANDS:
            print("Goodbye!")
            break

        history.append({"role": "human", "content": user_input})
        print("AI: ", end="", flush=True)
        parts = []
        try:
            async for text in llm.stream_reply(model_id, history, api_key):
                parts.append(text)
                print(text, end="", flush=True)
        except llm.LLMError as e:
            print(f"\nError: {e.message}")

        if parts:
            history.append({"role": "ai", "content": "".join(parts)})
        else:
            # drop the unanswered message so history stays human/ai paired
            history.pop()
        print("\n")


asyncio.run(main())
