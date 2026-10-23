import json
import pathlib

from app.render import render

DATA = pathlib.Path(__file__).parent / "data"


def test_page(snapshot):
    assert render({"title": "Home"}) == snapshot


def test_inputs():
    for case in (DATA / "input").glob("*.json"):
        expected = (DATA / "expected" / (case.stem + ".html")).read_text()
        assert render(json.loads(case.read_text())) == expected
