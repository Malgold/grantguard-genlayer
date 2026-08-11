"""Direct-mode tests for GrantGuard state and consensus paths."""

import json

from tests.direct.conftest import to_hex


MILESTONE_ID = "wallet-recovery-v1"
TITLE = "Social recovery contract milestone"
REQUIREMENTS = (
    "Ship a working recovery contract, document the threat model, and provide "
    "tests proving that fewer than three guardians cannot rotate ownership."
)
REPOSITORY = "https://github.com/example/recovery-wallet"
RUBRIC = "https://example.org/grants/recovery-wallet-m1"
EVIDENCE = "https://github.com/example/recovery-wallet/releases/tag/v1.0.0"
NOTE = "Release v1.0.0 contains the contract, threat model, and guardian tests."


def create_milestone(contract, vm, sponsor, beneficiary):
    vm.sender = sponsor
    contract.create_milestone(
        MILESTONE_ID,
        TITLE,
        to_hex(beneficiary),
        REQUIREMENTS,
        REPOSITORY,
        RUBRIC,
    )


def submit_evidence(contract, vm, beneficiary, note=NOTE, url=EVIDENCE):
    vm.sender = beneficiary
    contract.submit_evidence(MILESTONE_ID, url, note)


def mock_sources(vm):
    vm.mock_web(
        r".*github\.com/example/recovery-wallet$",
        {
            "status": 200,
            "body": "RecoveryWallet contract. Three-of-five guardian rotation. Tests included.",
        },
    )
    vm.mock_web(
        r".*example\.org/grants/recovery-wallet-m1.*",
        {
            "status": 200,
            "body": "Milestone requires implementation, threat model, and threshold tests.",
        },
    )
    vm.mock_web(
        r".*github\.com/example/recovery-wallet/releases/tag/v1\.0\.0.*",
        {
            "status": 200,
            "body": "v1.0.0 release: contract, threat-model.md, and 27 passing tests.",
        },
    )


def mock_assessment(vm, **overrides):
    assessment = {
        "verdict": "PASS",
        "evidence_reachable": True,
        "identity_consistent": True,
        "requirements_met": True,
        "implementation_substantiated": True,
        "confidence": 92,
        "reason_codes": ["REQUIREMENTS_MET"],
        "summary": (
            "The bound repository and v1.0.0 release substantiate the contract, "
            "threat model, and guardian-threshold tests required by the rubric."
        ),
    }
    assessment.update(overrides)
    vm.mock_llm(r".*GrantGuard adjudicator.*", json.dumps(assessment))


def test_create_binds_brief_and_identities(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/grant_guard.py")
    create_milestone(contract, direct_vm, direct_alice, direct_bob)

    stored = contract.get_milestone(MILESTONE_ID)
    assert stored["sponsor"] == to_hex(direct_alice)
    assert stored["beneficiary"] == to_hex(direct_bob)
    assert stored["requirements"] == REQUIREMENTS
    assert stored["repository_url"] == REPOSITORY
    assert stored["rubric_url"] == RUBRIC
    assert stored["status"] == "CREATED"
    assert contract.get_milestone_count() == 1


def test_duplicate_id_is_rejected(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/grant_guard.py")
    create_milestone(contract, direct_vm, direct_alice, direct_bob)

    with direct_vm.expect_revert("milestone already exists"):
        create_milestone(contract, direct_vm, direct_alice, direct_bob)


def test_rejects_non_github_repository(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/grant_guard.py")
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("repository must be a GitHub HTTPS URL"):
        contract.create_milestone(
            MILESTONE_ID,
            TITLE,
            to_hex(direct_bob),
            REQUIREMENTS,
            "https://example.org/source.zip",
            RUBRIC,
        )


def test_only_beneficiary_can_submit_evidence(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = direct_deploy("contracts/grant_guard.py")
    create_milestone(contract, direct_vm, direct_alice, direct_bob)
    direct_vm.sender = direct_charlie

    with direct_vm.expect_revert("only the beneficiary can submit evidence"):
        contract.submit_evidence(MILESTONE_ID, EVIDENCE, NOTE)


def test_pass_requires_all_gates_and_records_audit_fields(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract = direct_deploy("contracts/grant_guard.py")
    create_milestone(contract, direct_vm, direct_alice, direct_bob)
    submit_evidence(contract, direct_vm, direct_bob)
    mock_sources(direct_vm)
    mock_assessment(direct_vm)

    direct_vm.sender = direct_charlie
    contract.evaluate_milestone(MILESTONE_ID)

    stored = contract.get_milestone(MILESTONE_ID)
    assert stored["status"] == "PASS"
    assert stored["confidence"] == 92
    assert stored["reason_codes"] == "REQUIREMENTS_MET"
    assert stored["evaluated_by"] == to_hex(direct_charlie)
    assert stored["attempt"] == 1


def test_fail_records_reason_and_allows_revised_evidence(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/grant_guard.py")
    create_milestone(contract, direct_vm, direct_alice, direct_bob)
    submit_evidence(contract, direct_vm, direct_bob)
    mock_sources(direct_vm)
    mock_assessment(
        direct_vm,
        verdict="FAIL",
        requirements_met=False,
        implementation_substantiated=False,
        confidence=88,
        reason_codes=["MATERIAL_INCOMPLETE", "REQUIREMENT_UNPROVEN"],
        summary=(
            "The release is reachable, but it lacks the required threat model "
            "and does not substantiate the guardian-threshold test cases."
        ),
    )

    contract.evaluate_milestone(MILESTONE_ID)
    failed = contract.get_milestone(MILESTONE_ID)
    assert failed["status"] == "FAIL"
    assert failed["reason_codes"] == "MATERIAL_INCOMPLETE,REQUIREMENT_UNPROVEN"

    revised = "https://github.com/example/recovery-wallet/releases/tag/v1.0.1"
    submit_evidence(
        contract,
        direct_vm,
        direct_bob,
        note="Release v1.0.1 adds the threat model and threshold test evidence.",
        url=revised,
    )
    retried = contract.get_milestone(MILESTONE_ID)
    assert retried["status"] == "EVIDENCE_SUBMITTED"
    assert retried["attempt"] == 2
    assert retried["summary"] == ""


def test_inconsistent_pass_is_rejected(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy("contracts/grant_guard.py")
    create_milestone(contract, direct_vm, direct_alice, direct_bob)
    submit_evidence(contract, direct_vm, direct_bob)
    mock_sources(direct_vm)
    mock_assessment(
        direct_vm,
        implementation_substantiated=False,
        summary=(
            "The model claimed success while also reporting that implementation "
            "evidence was missing, so the response must not be accepted."
        ),
    )

    with direct_vm.expect_revert("PASS contradicts assessment gates"):
        contract.evaluate_milestone(MILESTONE_ID)


def test_pass_is_terminal(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/grant_guard.py")
    create_milestone(contract, direct_vm, direct_alice, direct_bob)
    submit_evidence(contract, direct_vm, direct_bob)
    mock_sources(direct_vm)
    mock_assessment(direct_vm)
    contract.evaluate_milestone(MILESTONE_ID)

    with direct_vm.expect_revert("milestone does not accept evidence"):
        submit_evidence(contract, direct_vm, direct_bob)
