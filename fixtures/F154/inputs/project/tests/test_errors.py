from app.errors import STATUS, Code


def test_every_code_has_a_status():
    """R-Y-1: given every code, when its status is looked up, then one is found."""
    assert all(code in STATUS for code in Code)
