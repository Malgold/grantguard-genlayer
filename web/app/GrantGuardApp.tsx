"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const CONTRACT_ADDRESS = "0x3f830e42594BD6A435180D7dC080a84077b88580" as const;
const EXPLORER_URL =
  "https://explorer-studio.genlayer.com/address/" + CONTRACT_ADDRESS;
const GITHUB_URL = "https://github.com/Malgold/grantguard-genlayer";

type EthereumProvider = {
  isRabby?: boolean;
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function errorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = Number((error as { code?: unknown }).code);
  return Number.isFinite(code) ? code : undefined;
}

async function switchToStudioNet(provider: EthereumProvider) {
  const chainId = `0x${studionet.id.toString(16)}`;
  const currentChainId = String(
    await provider.request({ method: "eth_chainId" }),
  );
  if (currentChainId.toLowerCase() === chainId.toLowerCase()) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error) {
    if (errorCode(error) !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: studionet.name,
          nativeCurrency: studionet.nativeCurrency,
          rpcUrls: [...studionet.rpcUrls.default.http],
          blockExplorerUrls: studionet.blockExplorers?.default.url
            ? [studionet.blockExplorers.default.url]
            : [],
        },
      ],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  }
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

type MilestoneRecord = {
  id: string;
  title: string;
  sponsor: string;
  beneficiary: string;
  status: string;
  attempt: number;
  confidence: number;
};

type TransactionState = {
  label: string;
  hash: string;
  stage: "wallet" | "consensus" | "finalized" | "error";
  message: string;
} | null;

type ActionName = "create" | "evidence" | "evaluate";

const readClient = createClient({ chain: studionet });
type WalletAccount = Extract<
  NonNullable<Parameters<typeof createClient>[0]>["account"],
  string
>;
type TransactionHash = Parameters<
  typeof readClient.waitForTransactionReceipt
>[0]["hash"];

async function waitForFinalizedTransaction(hash: TransactionHash) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await readClient.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.FINALIZED,
        interval: 1500,
        retries: 60,
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      }
    }
  }
  throw new Error(
    "The transaction was submitted, but StudioNet status polling is temporarily unavailable. " +
      errorMessage(lastError, "Refresh the audit trail to verify finality."),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value instanceof Map) {
    return Object.fromEntries(value.entries()) as Record<string, unknown>;
  }
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asNumber(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shorten(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 3) return value;
  return value.slice(0, head) + "…" + value.slice(-tail);
}

function statusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "pass") return "status-pass";
  if (normalized === "fail") return "status-fail";
  if (normalized.includes("insufficient")) return "status-warn";
  if (normalized.includes("evidence")) return "status-ready";
  return "status-created";
}

function normalizeMilestones(raw: unknown): MilestoneRecord[] {
  const source = asRecord(raw);
  return Object.entries(source)
    .map(([id, value]) => {
      const item = asRecord(value);
      return {
        id,
        title: String(item.title ?? id),
        sponsor: String(item.sponsor ?? ""),
        beneficiary: String(item.beneficiary ?? ""),
        status: String(item.status ?? "CREATED"),
        attempt: asNumber(item.attempt),
        confidence: asNumber(item.confidence),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export default function GrantGuardApp() {
  const [wallet, setWallet] = useState("");
  const [walletClient, setWalletClient] =
    useState<ReturnType<typeof createClient> | null>(null);
  const [walletMessage, setWalletMessage] = useState(
    "Connect Rabby to create, submit, or evaluate.",
  );
  const [activeAction, setActiveAction] = useState<ActionName>("create");
  const [milestones, setMilestones] = useState<MilestoneRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [transaction, setTransaction] = useState<TransactionState>(null);
  const [searchId, setSearchId] = useState("");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [showAll, setShowAll] = useState(false);

  const [createForm, setCreateForm] = useState({
    id: "grantguard-demo-v1",
    title: "Open-source wallet recovery milestone",
    beneficiary: "",
    requirements:
      "Ship the recovery contract, a public threat model, and tests proving fewer than three guardians cannot rotate ownership.",
    repository: "https://github.com/example/recovery-wallet",
    rubric: "https://example.org/grants/recovery-wallet-m1",
  });
  const [evidenceForm, setEvidenceForm] = useState({
    id: "grantguard-demo-v1",
    url: "https://github.com/example/recovery-wallet/releases/tag/v1.0.0",
    note: "Release v1.0.0 includes the contract, threat model, and threshold tests.",
  });
  const [evaluateId, setEvaluateId] = useState("grantguard-demo-v1");

  const stats = useMemo(() => {
    const finalized = milestones.filter((item) =>
      ["PASS", "FAIL", "INSUFFICIENT"].includes(item.status),
    ).length;
    const passed = milestones.filter((item) => item.status === "PASS").length;
    const evidenceReady = milestones.filter(
      (item) => item.status === "EVIDENCE_SUBMITTED",
    ).length;
    return { total: milestones.length, finalized, passed, evidenceReady };
  }, [milestones]);

  const refreshMilestones = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const result = await readClient.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_all_milestones",
        args: [],
      });
      setMilestones(normalizeMilestones(result));
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "The StudioNet contract could not be read.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMilestones();
  }, [refreshMilestones]);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0];
      if (Array.isArray(accounts) && accounts.length > 0) {
        const next = String(accounts[0]);
        setWallet(next);
        setCreateForm((current) =>
          current.beneficiary
            ? current
            : { ...current, beneficiary: next },
        );
      } else {
        setWallet("");
        setWalletClient(null);
      }
    };
    provider.on?.("accountsChanged", onAccounts);
    void provider
      .request({ method: "eth_accounts" })
      .then((accounts) => onAccounts(accounts))
      .catch(() => undefined);
    return () => provider.removeListener?.("accountsChanged", onAccounts);
  }, []);

  async function connectWallet() {
    const provider = window.ethereum;
    if (!provider) {
      throw new Error(
        "Rabby was not detected. Install or unlock Rabby, then reload this page.",
      );
    }
    setWalletMessage("Waiting for Rabby…");
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error("Rabby did not return an account.");
    }
    const address = String(accounts[0]) as WalletAccount;
    await switchToStudioNet(provider);
    const client = createClient({
      chain: studionet,
      account: address,
      provider:
        provider as NonNullable<
          NonNullable<Parameters<typeof createClient>[0]>["provider"]
        >,
    });
    setWallet(address);
    setWalletClient(client);
    setWalletMessage(
      provider.isRabby
        ? "Rabby connected on StudioNet."
        : "Compatible wallet connected on StudioNet.",
    );
    setCreateForm((current) => ({
      ...current,
      beneficiary: current.beneficiary || address,
    }));
    return client;
  }

  async function getWriter() {
    if (walletClient) return walletClient;
    return connectWallet();
  }

  async function writeContract(
    label: string,
    functionName: string,
    args: string[],
  ) {
    setTransaction({
      label,
      hash: "",
      stage: "wallet",
      message: "Confirm this transaction in Rabby.",
    });
    try {
      const writer = await getWriter();
      const hash = await writer.writeContract({
        address: CONTRACT_ADDRESS,
        functionName,
        args,
        value: BigInt(0),
      });
      setTransaction({
        label,
        hash,
        stage: "consensus",
        message: "Signed. GenLayer validators are reaching consensus.",
      });
      const receipt = await waitForFinalizedTransaction(hash);
      const execution = String(receipt.txExecutionResultName ?? "");
      if (execution.includes("ERROR")) {
        throw new Error("Consensus finalized, but contract execution failed.");
      }
      setTransaction({
        label,
        hash,
        stage: "finalized",
        message: "Finalized on StudioNet. The audit view has been refreshed.",
      });
      await refreshMilestones();
      return true;
    } catch (error) {
      setTransaction((current) => ({
        label,
        hash: current?.hash ?? "",
        stage: "error",
        message: errorMessage(error, "The transaction failed."),
      }));
      return false;
    }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await writeContract("Create milestone", "create_milestone", [
      createForm.id.trim(),
      createForm.title.trim(),
      createForm.beneficiary.trim(),
      createForm.requirements.trim(),
      createForm.repository.trim(),
      createForm.rubric.trim(),
    ]);
  }

  async function submitEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await writeContract("Submit evidence", "submit_evidence", [
      evidenceForm.id.trim(),
      evidenceForm.url.trim(),
      evidenceForm.note.trim(),
    ]);
  }

  async function submitEvaluation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await writeContract("Evaluate milestone", "evaluate_milestone", [
      evaluateId.trim(),
    ]);
  }

  async function inspectMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDetail(null);
    try {
      const result = await readClient.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_milestone",
        args: [searchId.trim()],
      });
      setDetail(asRecord(result));
    } catch (error) {
      setDetail({
        error:
          error instanceof Error ? error.message : "Milestone was not found.",
      });
    }
  }

  const visibleMilestones = showAll ? milestones : milestones.slice(0, 6);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="GrantGuard home">
          <span className="brand-mark">GG</span>
          <span>GrantGuard</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#workbench">Workbench</a>
          <a href="#audit">Audit trail</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            Source
          </a>
        </nav>
        <button
          className="wallet-button"
          type="button"
          onClick={() =>
            void connectWallet().catch((error: unknown) =>
              setWalletMessage(errorMessage(error, "Wallet connection failed.")),
            )
          }
        >
          {wallet ? shorten(wallet) : "Connect Rabby"}
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Onchain grant operations · GenLayer StudioNet</p>
          <h1>
            Proof before
            <span>payout.</span>
          </h1>
          <p className="hero-intro">
            Bind a milestone before work begins. Let independent validators inspect
            public evidence. Act on a consensus verdict—not a private reviewer.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#workbench">
              Open workbench
            </a>
            <a
              className="button button-secondary"
              href={EXPLORER_URL}
              target="_blank"
              rel="noreferrer"
            >
              Verify contract ↗
            </a>
          </div>
          <p className="wallet-note">{walletMessage}</p>
        </div>

        <aside className="proof-card" aria-label="Live contract summary">
          <div className="proof-card-head">
            <span>LIVE CONTRACT</span>
            <span className="pulse">FINALIZED</span>
          </div>
          <p className="contract-address">{shorten(CONTRACT_ADDRESS, 12, 10)}</p>
          <div className="proof-flow">
            <div><b>01</b><span>Bind brief</span></div>
            <div><b>02</b><span>Submit proof</span></div>
            <div><b>03</b><span>Reach verdict</span></div>
          </div>
          <div className="proof-rule">
            <span>Consensus rule</span>
            <strong>4 gates + semantic agreement</strong>
          </div>
          <button
            className="copy-address"
            type="button"
            onClick={() => void navigator.clipboard.writeText(CONTRACT_ADDRESS)}
          >
            Copy full address
          </button>
        </aside>
      </section>

      <section className="metric-strip" aria-label="Contract metrics">
        <article><strong>{isLoading ? "—" : stats.total}</strong><span>milestones bound</span></article>
        <article><strong>{isLoading ? "—" : stats.evidenceReady}</strong><span>ready for review</span></article>
        <article><strong>{isLoading ? "—" : stats.finalized}</strong><span>verdicts finalized</span></article>
        <article><strong>{isLoading ? "—" : stats.passed}</strong><span>requirements passed</span></article>
      </section>

      <section className="trust-section">
        <div className="section-heading">
          <p className="eyebrow">Why GenLayer</p>
          <h2>One reviewer can be wrong. A reproducible decision is inspectable.</h2>
        </div>
        <div className="gate-grid">
          <article><span>GATE 01</span><h3>Reachability</h3><p>Every validator independently renders the repository, rubric, and evidence.</p></article>
          <article><span>GATE 02</span><h3>Identity</h3><p>Evidence must describe the same project and beneficiary bound at creation.</p></article>
          <article><span>GATE 03</span><h3>Requirements</h3><p>Every immutable requirement must be substantively satisfied—not merely claimed.</p></article>
          <article><span>GATE 04</span><h3>Implementation</h3><p>Public artifacts must prove working output. Ambiguity resolves to insufficient.</p></article>
        </div>
      </section>

      <section className="workbench" id="workbench">
        <div className="workbench-copy">
          <p className="eyebrow">Signed contract workbench</p>
          <h2>Move a milestone from promise to verdict.</h2>
          <p>Each action is signed by your wallet and tracked through GenLayer consensus to finality.</p>
          <ol>
            <li className={activeAction === "create" ? "active" : ""}>
              <button type="button" onClick={() => setActiveAction("create")}><span>01</span>Bind the brief</button>
            </li>
            <li className={activeAction === "evidence" ? "active" : ""}>
              <button type="button" onClick={() => setActiveAction("evidence")}><span>02</span>Attach evidence</button>
            </li>
            <li className={activeAction === "evaluate" ? "active" : ""}>
              <button type="button" onClick={() => setActiveAction("evaluate")}><span>03</span>Request verdict</button>
            </li>
          </ol>
        </div>

        <div className="action-panel">
          {activeAction === "create" && (
            <form onSubmit={submitCreate}>
              <div className="form-head">
                <span>STEP 01</span>
                <h3>Create an immutable milestone</h3>
                <p>The brief, sources, and beneficiary cannot be rewritten later.</p>
              </div>
              <div className="field-row">
                <label>Milestone ID
                  <input required minLength={3} maxLength={64} value={createForm.id}
                    onChange={(event) => setCreateForm({ ...createForm, id: event.target.value })} />
                </label>
                <label>Beneficiary wallet
                  <input required pattern="0x[0-9a-fA-F]{40}" placeholder="0x…" value={createForm.beneficiary}
                    onChange={(event) => setCreateForm({ ...createForm, beneficiary: event.target.value })} />
                </label>
              </div>
              <label>Public title
                <input required maxLength={120} value={createForm.title}
                  onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })} />
              </label>
              <label>Acceptance requirements
                <textarea required minLength={20} maxLength={1600} rows={4} value={createForm.requirements}
                  onChange={(event) => setCreateForm({ ...createForm, requirements: event.target.value })} />
              </label>
              <div className="field-row">
                <label>GitHub repository
                  <input required type="url" pattern="https://.*" value={createForm.repository}
                    onChange={(event) => setCreateForm({ ...createForm, repository: event.target.value })} />
                </label>
                <label>Public rubric
                  <input required type="url" pattern="https://.*" value={createForm.rubric}
                    onChange={(event) => setCreateForm({ ...createForm, rubric: event.target.value })} />
                </label>
              </div>
              <button className="submit-action" type="submit">Sign and create milestone</button>
            </form>
          )}

          {activeAction === "evidence" && (
            <form onSubmit={submitEvidence}>
              <div className="form-head">
                <span>STEP 02</span>
                <h3>Submit public implementation evidence</h3>
                <p>Only the bound beneficiary can attach or revise evidence.</p>
              </div>
              <label>Milestone ID
                <input required value={evidenceForm.id}
                  onChange={(event) => setEvidenceForm({ ...evidenceForm, id: event.target.value })} />
              </label>
              <label>Evidence URL
                <input required type="url" pattern="https://.*" value={evidenceForm.url}
                  onChange={(event) => setEvidenceForm({ ...evidenceForm, url: event.target.value })} />
              </label>
              <label>Evidence note
                <textarea required minLength={12} maxLength={800} rows={5} value={evidenceForm.note}
                  onChange={(event) => setEvidenceForm({ ...evidenceForm, note: event.target.value })} />
              </label>
              <button className="submit-action" type="submit">Sign and submit evidence</button>
            </form>
          )}

          {activeAction === "evaluate" && (
            <form onSubmit={submitEvaluation}>
              <div className="form-head">
                <span>STEP 03</span>
                <h3>Ask validators for a verdict</h3>
                <p>Validators independently fetch the sources and must agree on all decision-critical fields.</p>
              </div>
              <label>Milestone ID
                <input required value={evaluateId} onChange={(event) => setEvaluateId(event.target.value)} />
              </label>
              <div className="consensus-box">
                <span>DECISION OUTPUT</span>
                <div><b>PASS</b><b>FAIL</b><b>INSUFFICIENT</b></div>
                <p>Confidence may vary by at most 12 points. A PASS requires all four gates and the canonical REQUIREMENTS_MET reason code.</p>
              </div>
              <button className="submit-action" type="submit">Sign and request consensus</button>
            </form>
          )}
        </div>
      </section>

      {transaction && (
        <section className={"transaction-drawer " + transaction.stage} aria-live="polite">
          <div><span>TRANSACTION</span><strong>{transaction.label}</strong></div>
          <div className="transaction-steps">
            <i className="done">1</i><span>Wallet</span>
            <i className={transaction.stage !== "wallet" ? "done" : ""}>2</i><span>Consensus</span>
            <i className={transaction.stage === "finalized" ? "done" : ""}>3</i><span>Finality</span>
          </div>
          <p>{transaction.message}</p>
          {transaction.hash && (
            <a href={"https://explorer-studio.genlayer.com/transactions/" + transaction.hash} target="_blank" rel="noreferrer">
              {shorten(transaction.hash, 10, 8)} ↗
            </a>
          )}
          <button type="button" onClick={() => setTransaction(null)}>Close</button>
        </section>
      )}

      <section className="audit-section" id="audit">
        <div className="audit-head">
          <div><p className="eyebrow">Finalized contract state</p><h2>Public audit trail</h2></div>
          <button type="button" onClick={() => void refreshMilestones()}>Refresh chain state</button>
        </div>
        {loadError && <p className="chain-error">{loadError}</p>}
        {!isLoading && milestones.length === 0 && !loadError && (
          <div className="empty-state">
            <span>NO MILESTONES YET</span>
            <h3>The contract is live and waiting for its first public brief.</h3>
            <p>Connect Rabby and use the workbench above. Every finalized record will appear here directly from StudioNet.</p>
          </div>
        )}
        {visibleMilestones.length > 0 && (
          <div className="milestone-list">
            {visibleMilestones.map((milestone) => (
              <article key={milestone.id}>
                <div>
                  <span className={"status-pill " + statusClass(milestone.status)}>{milestone.status.replaceAll("_", " ")}</span>
                  <span className="milestone-id">{milestone.id}</span>
                </div>
                <h3>{milestone.title}</h3>
                <dl>
                  <div><dt>Sponsor</dt><dd>{shorten(milestone.sponsor)}</dd></div>
                  <div><dt>Beneficiary</dt><dd>{shorten(milestone.beneficiary)}</dd></div>
                  <div><dt>Attempts</dt><dd>{milestone.attempt}</dd></div>
                  <div><dt>Confidence</dt><dd>{milestone.confidence}%</dd></div>
                </dl>
                <button type="button" onClick={() => { setSearchId(milestone.id); window.location.hash = "inspect"; }}>Inspect record</button>
              </article>
            ))}
          </div>
        )}
        {milestones.length > 6 && (
          <button className="show-all" type="button" onClick={() => setShowAll((current) => !current)}>
            {showAll ? "Show fewer records" : "Show every record"}
          </button>
        )}
        <div className="inspect-panel" id="inspect">
          <form onSubmit={inspectMilestone}>
            <label>Inspect a milestone by ID
              <span>
                <input required placeholder="milestone-id" value={searchId} onChange={(event) => setSearchId(event.target.value)} />
                <button type="submit">Read finalized state</button>
              </span>
            </label>
          </form>
          {detail && (
            <pre>{JSON.stringify(detail, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)}</pre>
          )}
        </div>
      </section>

      <section className="closing-section">
        <p className="eyebrow">Composable by design</p>
        <h2>The verdict is a primitive. Your grant program decides what happens next.</h2>
        <p>GrantGuard does not custody funds. DAOs, grant operators, and escrow contracts can read its finalized decision before releasing value.</p>
        <div>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">Review source ↗</a>
          <a href={EXPLORER_URL} target="_blank" rel="noreferrer">Inspect deployment ↗</a>
        </div>
      </section>

      <footer>
        <a className="brand" href="#top"><span className="brand-mark">GG</span><span>GrantGuard</span></a>
        <p>Source-bound adjudication for open-source grant milestones.</p>
        <span>StudioNet · Chain 61999</span>
      </footer>
    </main>
  );
}
