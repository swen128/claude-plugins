# todo-enforcer

Blocks Claude from stopping until all TODO items are completed.

## Installation

```
/plugin install todo-enforcer@swen128-claude-plugins
```

## Example

**User**: Add input validation to the signup form

**Claude** creates todos:
1. Add email format validation ✓
2. Add password strength check (in progress)
3. Add error messages

**Claude** tries to stop:

I've completed the email validation. That should cover the basic—

**Hook output**:

```json
{"decision":"block","reason":"TODO is incomplete"}
```

**Claude** corrects:

You're right, I still have incomplete todos. Let me continue with the password strength check and error messages before stopping.
