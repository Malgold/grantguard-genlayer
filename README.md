# GrantGuard

GrantGuard is a complete GenLayer application for adjudicating open-source grant
milestones from public evidence. Its Intelligent Contract binds the grant brief,
beneficiary, repository, and rubric before evidence is submitted, then asks
independent GenLayer validators to inspect the same live sources and agree on a
structured `PASS`, `FAIL`, or `INSUFFICIENT` verdict. The accompanying web app
gives sponsors, builders, and reviewers a real transaction workbench.

A grant program, DAO, or escrow can read the finalized GrantGuard verdict before
releasing funds.

## Live deployment

- StudioNet contract: [`0x3f830e42594BD6A435180D7dC080a84077b88580`](https://explorer-studio.genlayer.com/address/0x3f830e42594BD6A435180D7dC080a84077b88580)
- Network: GenLayer StudioNet, chain ID `61999`
- Frontend: [grantguard-public.sckavanagh.chatgpt.site](https://grantguard-public.sckavanagh.chatgpt.site)

The frontend detects Rabby through the standard EIP-1193 provider, switches to
StudioNet, reads live contract state, submits all three lifecycle transactions,
and tracks each write through consensus and finality with explorer links.

## The trust problem

Grant programs commonly release milestone payments after one reviewer checks a
repository, release page, demo, or progress report. That reviewer can be
inconsistent, unavailable, or conflicted. Ordinary smart contracts cannot fetch
those sources or judge whether implementation evidence satisfies a natural-
language milestone.

GrantGuard makes the brief immutable and moves the evidence review to GenLayer
consensus. Neither the sponsor nor beneficiary can rewrite the bound sources
after the fact, and no single model output becomes the verdict.

## Contract lifecycle

1. A sponsor calls `create_milestone` with a stable ID, beneficiary, requirements,
   GitHub repository, and public rubric URL.
2. The beneficiary calls `submit_evidence` with a public evidence URL and an
   explanatory note.
3. Anyone calls `evaluate_milestone`.
4. Each validator independently renders the repository, rubric, and evidence,
   treats page content as untrusted data, and applies four fixed gates.
5. The contract stores an auditable verdict, confidence, reason codes, summary,
   evaluator, and attempt number.
6. `FAIL` and `INSUFFICIENT` permit revised evidence; `PASS` is terminal.

## Why the consensus check is substantive

GrantGuard does not accept any correctly shaped JSON. Every validator repeats
the web fetch and assessment. The leader and validator must agree exactly on:

- verdict;
- source reachability;
- project identity consistency;
- whether every on-chain requirement is met;
- whether implementation is materially substantiated; and
- the canonical set of reason codes.

Confidence may differ by at most 12 points. Internal invariants also make a
`PASS` impossible unless every gate is true and `REQUIREMENTS_MET` is present.
Free-form summaries are recorded for humans but do not control the verdict.

## Prompt-injection and ambiguity handling

- Repository, rubric, and evidence text are explicitly delimited as untrusted
  sources and cannot redefine the adjudicator's role or output policy.
- The on-chain requirements are separated from beneficiary claims.
- Source content is length-bounded before it enters the prompt.
- Unreachable, conflicting, ambiguous, or weak evidence must resolve to
  `INSUFFICIENT`, not `PASS`.
- Output is normalized against a closed verdict and reason-code vocabulary.
- A beneficiary can retry a non-passing assessment without erasing the attempt
  counter or mutating the original brief.

## Repository layout

```text
contracts/grant_guard.py       Intelligent Contract
tests/direct/test_grant_guard.py
deploy/deployScript.ts         GenLayer CLI deployment script
.github/workflows/ci.yml       Contract lint and direct tests
web/app/GrantGuardApp.tsx      Rabby-connected transaction workbench
web/tests/                     Server-rendered product checks
PROJECT_SUBMISSION.md          Reviewer-oriented evidence and product delta
```

## Local verification

Prerequisites: Python 3.12+, Node.js, and the GenLayer CLI.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
genvm-lint check contracts/grant_guard.py
pytest tests/direct/ -v
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck

cd web
pnpm install --frozen-lockfile
pnpm run build
pnpm test
```

The direct tests mock both web pages and LLM responses, so they do not require a
running Studio instance.

## Deploy

Choose a network and run the included deployment script:

```bash
genlayer network
genlayer deploy
```

For a direct deployment:

```bash
genlayer deploy --contract contracts/grant_guard.py
```

## Example calls

```text
create_milestone(
  "wallet-recovery-v1",
  "Social recovery contract milestone",
  "0xBeneficiaryAddress",
  "Ship the contract, threat model, and tests proving fewer than three guardians cannot rotate ownership.",
  "https://github.com/example/recovery-wallet",
  "https://example.org/grants/recovery-wallet-m1"
)

submit_evidence(
  "wallet-recovery-v1",
  "https://github.com/example/recovery-wallet/releases/tag/v1.0.0",
  "Release v1.0.0 contains the contract, threat model, and guardian-threshold tests."
)

evaluate_milestone("wallet-recovery-v1")
```

## Intentional boundaries

- GrantGuard records a verdict; it does not custody or release funds.
- It evaluates public web evidence only. Private repositories and login-gated
  sources are unsuitable.
- A `PASS` is evidence-based adjudication, not a security audit or legal opinion.
- Consumers should wait for transaction finality and may use GenLayer's appeal
  process before acting on a verdict.

## License

MIT
