from cli.parse import parse


class TestParse:
    """CLI-1: the parser reads a line."""

    def test_reads(self):
        assert parse(" a ") == "a"
