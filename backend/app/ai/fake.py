"""Scripted fake analyzer for tests and demos (018)."""

import threading

from app.ai.protocols import AIUnavailableError, AnalysisRequest, ClothingAnalyzer
from app.ai.schemas import AnalysisResult

# Bounds gate waits so a stuck background job cannot hang the suite forever.
GATE_WAIT_SECONDS = 30.0


class FakeAnalyzer(ClothingAnalyzer):
    """Returns a scripted result, raises a scripted error, or both.

    Pass an unset ``threading.Event`` as ``gate`` to hold the job inside
    ``analyze`` (trigger tests assert the pending response while gated).
    """

    def __init__(
        self,
        result: AnalysisResult | None = None,
        gate: threading.Event | None = None,
        error: Exception | None = None,
    ) -> None:
        self._result = result or AnalysisResult(
            colors=[],
            pattern=None,
            material_estimate=None,
            style_tags=[],
            visible_details=[],
            size_label=None,
            uncertainties=[],
        )
        self._gate = gate
        self._error = error
        self.calls: list[AnalysisRequest] = []

    def analyze(self, request: AnalysisRequest) -> AnalysisResult:
        self.calls.append(request)
        if self._gate is not None:
            self._gate.wait(timeout=GATE_WAIT_SECONDS)
        if self._error is not None:
            if isinstance(self._error, AIUnavailableError):
                raise self._error
            raise AIUnavailableError("Fake analyzer failed.") from self._error
        return self._result
