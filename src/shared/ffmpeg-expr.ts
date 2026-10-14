// A reference evaluator for the subset of ffmpeg's expression language that
// render-plan.ts emits. Test-only: nothing in the app imports it. It exists so
// the emitted volume expression can be compared numerically against
// interpolate(), which is the only way to actually prove the two backends agree
// rather than merely intending to.
//
// Supported grammar:
//   expr    := term (('+' | '-') term)*
//   term    := unary (('*' | '/') unary)*
//   unary   := '-' unary | primary
//   primary := NUMBER | IDENT | IDENT '(' args ')' | '(' expr ')'
// Functions: pow(a,b), lt(a,b), if(cond,a,b). Variables: whatever the caller
// supplies, normally just `t`.
//
// Anything outside that subset throws rather than guessing, so a change to what
// render-plan emits fails loudly here instead of silently evaluating wrong.

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; char: string }

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      tokens.push({ kind: 'num', value: parseFloat(src.slice(i, j)) })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < src.length && /[A-Za-z_0-9]/.test(src[j])) j++
      tokens.push({ kind: 'ident', name: src.slice(i, j) })
      i = j
      continue
    }
    if ('+-*/(),'.includes(c)) { tokens.push({ kind: 'op', char: c }); i++; continue }
    throw new Error(`ffmpeg expression: unsupported character '${c}' in "${src}"`)
  }
  return tokens
}

/** Evaluates `src` with the given variable bindings. */
export function evalFfmpegExpression(src: string, vars: Record<string, number>): number {
  const tokens = tokenize(src)
  let pos = 0

  const peek = () => tokens[pos]
  const take = () => tokens[pos++]
  const isOp = (t: Token | undefined, char: string) => t?.kind === 'op' && t.char === char

  function callFunction(name: string, args: number[]): number {
    switch (name) {
      case 'pow': return Math.pow(args[0], args[1])
      case 'lt': return args[0] < args[1] ? 1 : 0
      // ffmpeg's if() tests the condition against zero, not against truthiness
      // of a boolean, and returns 1/0 from lt().
      case 'if': return args[0] !== 0 ? args[1] : args[2]
      default: throw new Error(`ffmpeg expression: unsupported function '${name}'`)
    }
  }

  function primary(): number {
    const token = take()
    if (!token) throw new Error(`ffmpeg expression: unexpected end of "${src}"`)

    if (token.kind === 'num') return token.value

    if (token.kind === 'ident') {
      if (isOp(peek(), '(')) {
        take()
        const args: number[] = []
        if (!isOp(peek(), ')')) {
          args.push(expression())
          while (isOp(peek(), ',')) { take(); args.push(expression()) }
        }
        if (!isOp(take(), ')')) throw new Error(`ffmpeg expression: expected ')' after ${token.name}(...)`)
        return callFunction(token.name, args)
      }
      if (!(token.name in vars)) throw new Error(`ffmpeg expression: unknown variable '${token.name}'`)
      return vars[token.name]
    }

    if (isOp(token, '(')) {
      const value = expression()
      if (!isOp(take(), ')')) throw new Error(`ffmpeg expression: expected ')' in "${src}"`)
      return value
    }

    throw new Error(`ffmpeg expression: unexpected token ${JSON.stringify(token)} in "${src}"`)
  }

  function unary(): number {
    if (isOp(peek(), '-')) { take(); return -unary() }
    return primary()
  }

  function term(): number {
    let value = unary()
    while (isOp(peek(), '*') || isOp(peek(), '/')) {
      const op = (take() as { char: string }).char
      const rhs = unary()
      value = op === '*' ? value * rhs : value / rhs
    }
    return value
  }

  function expression(): number {
    let value = term()
    while (isOp(peek(), '+') || isOp(peek(), '-')) {
      const op = (take() as { char: string }).char
      const rhs = term()
      value = op === '+' ? value + rhs : value - rhs
    }
    return value
  }

  const result = expression()
  if (pos !== tokens.length) {
    throw new Error(`ffmpeg expression: trailing input at token ${pos} in "${src}"`)
  }
  return result
}
