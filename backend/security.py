# password hashing, login tokens and api key encryption
import hashlib
import hmac
import secrets
from datetime import timedelta

import jwt
from cryptography.fernet import Fernet

from config import ENCRYPTION_KEY, JWT_SECRET, SESSION_DAYS
from db import now

# passwords: scrypt from the standard library, stored as "scrypt$salt$hash"

def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password, stored):
    try:
        _, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
    return hmac.compare_digest(digest.hex(), digest_hex)


# login sessions: a signed jwt kept in an httponly cookie

def create_token(user_id):
    payload = {"sub": user_id, "exp": now() + timedelta(days=SESSION_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def read_token(token):
    """Return the user id, or None if the token is invalid or expired."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])["sub"]
    except jwt.PyJWTError:
        return None


# saved api keys: encrypted at rest with the master key from .env

_fernet = Fernet(ENCRYPTION_KEY)


def encrypt_key(plain):
    return _fernet.encrypt(plain.encode()).decode()


def decrypt_key(token):
    return _fernet.decrypt(token.encode()).decode()
