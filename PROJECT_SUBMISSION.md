# GrantGuard Project Submission

## One-line pitch

GrantGuard replaces one-person grant milestone reviews with an auditable
GenLayer consensus decision over live repositories, rubrics, and evidence.

## Trust problem

Open-source grant programs often release milestone payments after a single
reviewer interprets a natural-language brief and checks scattered public links.
That process is inconsistent, difficult to audit, and vulnerable to unavailable
or conflicted reviewers. A conventional smart contract cannot browse those
sources or judge whether the work actually satisfies the brief.

GrantGuard fixes this by binding the brief and authoritative sources onchain,
then having independent GenLayer validators inspect the same live evidence and
agree on a structured verdict. The finalized record is designed to be consumed
by grant operators, DAOs, or escrow systems before value is released.

## Complete user journey

The deployed product is more than a contract demo. From one responsive app a
Rabby user can:

1. connect a wallet and switch to GenLayer StudioNet;
2. create a milestone with beneficiary, requirements, repository, and rubric;
3. let the beneficiary submit a public evidence URL and explanation;
4. request a consensus evaluation;
5. follow the transaction from wallet signature through consensus to finality;
6. open the transaction in the explorer; and
7. inspect live milestone records and structured verdicts from contract state.

## Why GenLayer is essential

The core decision depends on non-deterministic web access and natural-language
judgment. Validators render the repository, rubric, and evidence themselves;
treat external text as untrusted; apply fixed gates; normalize the result to a
closed verdict/reason vocabulary; and compare leader and validator outputs.
Ordinary EVM execution cannot perform this live evidence adjudication.

## Safety and adjudication design

- The grant brief and authoritative sources are immutable after creation.
- Repository, rubric, and evidence content are explicitly treated as untrusted
  data and cannot redefine the evaluator's instructions.
- A `PASS` requires every gate plus the `REQUIREMENTS_MET` reason code.
- Unreachable, ambiguous, conflicting, or thin evidence resolves to
  `INSUFFICIENT`, never an optimistic pass.
- Confidence may differ slightly, but validators must agree on the verdict,
  gates, and canonical reason-code set.
- Non-passing evidence can be revised without erasing the attempt history;
  `PASS` is terminal.
- The app never handles private keys and does not custody funds.

## Verifiable evidence

- Contract: `contracts/grant_guard.py`
- Frontend: `web/app/GrantGuardApp.tsx`
- Direct contract tests: `tests/direct/test_grant_guard.py`
- Frontend checks: `web/tests/rendered-html.test.mjs`
- Deployment script: `deploy/deployScript.ts`
- Deployed contract: https://explorer-studio.genlayer.com/address/0x3f830e42594BD6A435180D7dC080a84077b88580
- Live application: https://grantguard-public.sckavanagh.chatgpt.site
- Baseline contract commit: `c7c5eef`

## Verification completed

- GenLayer VM direct tests: 8 passing
- Contract lint, validation, and typecheck: passing
- Frontend TypeScript check: passing
- Production frontend build: passing
- Server-rendered product tests: 2 passing

## Intentional boundary

GrantGuard records a consensus verdict but does not itself custody or release
funds. This makes the adjudication primitive reusable: downstream grant and
escrow systems can define their own finality, appeal, and payout policies.
