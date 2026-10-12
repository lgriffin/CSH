from PySide6.QtCore import QObject, QThread, Signal


class Updater(QThread):
    class Signals(QObject):
        finished = Signal(bool)

    def __init__(self) -> None:
        super().__init__()
        self.signals = Updater.Signals()

    def run(self) -> None:
        class Probe:
            reachable = True

        self.signals.finished.emit(Probe.reachable)
