"""Shared helpers for GrantGuard direct-mode tests."""


def to_hex(addr_bytes):
    if hasattr(addr_bytes, "as_hex"):
        return addr_bytes.as_hex
    from genlayer.py.types import Address

    return Address(addr_bytes).as_hex
