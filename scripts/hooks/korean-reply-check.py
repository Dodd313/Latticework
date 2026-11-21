#!/usr/bin/env python3
"""Stop 훅: 이번 턴에 사용자에게 보낸 답변이 영어 위주이면 멈추지 못하게 하고 한국어로 다시 보내게 한다.

AGENTS.md 의 "사용자에게 보내는 모든 답변은 한국어" 규칙을 지키기 위한 장치(2026-11-21 사용자 승인).
코드 블록, 인라인 코드, 주소, 파일 경로는 세지 않는다. 한글보다 영문 글자가 많고 30자 이상인 문단이 있으면 막는다.
이미 한 번 막은 뒤(stop_hook_active)에는 다시 막지 않는다(무한 반복 방지).
"""
import json
import re
import sys


def visible_text(t: str) -> str:
    t = re.sub(r"```.*?```", " ", t, flags=re.S)
    t = re.sub(r"`[^`]*`", " ", t)
    t = re.sub(r"https?://\S+", " ", t)
    t = re.sub(r"(?:[\w.-]+/)+[\w.-]+", " ", t)  # 파일 경로
    return t


def english_heavy(t: str) -> bool:
    v = visible_text(t)
    hangul = len(re.findall(r"[가-힣]", v))
    latin = len(re.findall(r"[A-Za-z]", v))
    return latin >= 30 and latin > hangul


def turn_texts(path: str) -> list:
    texts = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                d = json.loads(line)
            except Exception:
                continue
            kind = d.get("type")
            content = (d.get("message") or {}).get("content")
            if kind == "user":
                # 사람의 새 메시지에서 턴을 새로 센다(도구 결과는 같은 턴).
                if isinstance(content, str) or (
                    isinstance(content, list)
                    and not any(isinstance(x, dict) and x.get("type") == "tool_result" for x in content)
                ):
                    texts = []
            elif kind == "assistant" and isinstance(content, list):
                for x in content:
                    if isinstance(x, dict) and x.get("type") == "text" and x.get("text", "").strip():
                        texts.append(x["text"])
    return texts


def main() -> None:
    try:
        data = json.loads(sys.stdin.read() or "{}")
    except Exception:
        return
    if data.get("stop_hook_active"):
        return
    path = data.get("transcript_path")
    if not path:
        return
    try:
        texts = turn_texts(path)
    except Exception:
        return
    bad = [t for t in texts if english_heavy(t)]
    if not bad:
        return
    sample = re.sub(r"\s+", " ", visible_text(bad[-1])).strip()[:80]
    print(json.dumps({
        "decision": "block",
        "reason": (
            "이번 턴의 답변에 영어로 쓴 부분이 있다(예: \"" + sample + "\"). "
            "AGENTS.md 규칙대로 사용자에게 보낸 내용을 빠짐없이 한국어로 다시 보내라. "
            "고유명사, 코드, 파일 이름, 주소만 원문으로 둔다."
        ),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
