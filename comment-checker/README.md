# comment-checker

Whenever AI tries to write code comments, this plugin tells them to remove unnecessary comments.

## Installation

```
/plugin install comment-checker@swen128-claude-plugins
```

## Example

**User**: Create a function to calculate fibonacci numbers

**Claude** writes:

```typescript
// Calculate the nth fibonacci number using recursion
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
```

**Hook output**:

```
COMMENT/DOCSTRING DETECTED - IMMEDIATE ACTION REQUIRED

...

PRIORITY-BASED ACTION GUIDELINES:

1. This is a comment/docstring that already existed before
   -> Explain to the user that this is an existing comment/docstring and proceed (justify it)

2. This is a newly written comment: but it's in given, when, then format
   -> Tell the user it's a BDD comment and proceed (justify it)
   -> Note: This applies to comments only, not docstrings

3. This is a newly written comment/docstring: but it's a necessary comment/docstring
   -> Tell the user why this comment/docstring is absolutely necessary and proceed (justify it)
   -> Examples of necessary comments: complex algorithms, security-related, performance optimization, regex, mathematical formulas
   -> Examples of necessary docstrings: public API documentation, complex module/class interfaces
   -> IMPORTANT: Most docstrings are unnecessary if the code is self-explanatory. Only keep truly essential ones.

4. This is a newly written comment/docstring: but it's an unnecessary comment/docstring
   -> Apologize to the user and remove the comment/docstring.
   -> Make the code itself clearer so it can be understood without comments/docstrings.
   -> For verbose docstrings: refactor code to be self-documenting instead of adding lengthy explanations.

...

Detected comments/docstrings:
<comments file="fibonacci.ts">
  <comment line-number="1">// Calculate the nth fibonacci number using recursion</comment>
</comments>
```

**Claude** corrects:

I apologize for adding an unnecessary comment. The function name `fibonacci` and parameter `n` are self-explanatory. Let me remove it:

```typescript
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
```

