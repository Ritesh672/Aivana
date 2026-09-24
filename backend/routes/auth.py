# sign up, log in, log out and "who am i"
import re

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from db import User
from deps import COOKIE_NAME, current_user, get_db, set_session_cookie
from security import hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Credentials(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=200)


def user_out(user):
    return {"id": user.id, "email": user.email}


@router.post("/signup")
def signup(body: Credentials, response: Response, db=Depends(get_db)):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Enter a valid email address")
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists")
    user = User(email=email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    set_session_cookie(response, user.id)
    return user_out(user)


@router.post("/login")
def login(body: Credentials, response: Response, db=Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password")
    set_session_cookie(response, user.id)
    return user_out(user)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@router.get("/me")
def me(user=Depends(current_user)):
    return user_out(user)
