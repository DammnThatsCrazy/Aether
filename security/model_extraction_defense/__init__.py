"""
Aether Security — Model Extraction Defense

Modular defense layer against model extraction and knowledge distillation
attacks. Integrates as middleware into the ML serving pipeline.

Components:
  - QueryRateLimiter:        Per-key + per-IP sliding window limits
  - QueryPatternDetector:    Sweep, similarity, entropy, timing analysis
  - OutputPerturbationLayer: Logit noise, top-k clipping, entropy smoothing
  - ModelWatermark:          Probabilistic signature embedding in outputs
  - CanaryInputDetector:     Hidden trap inputs to detect scraping
  - ExtractionRiskScorer:    Aggregated risk score driving response degradation

Quick start:
    from security.model_extraction_defense import ExtractionDefenseLayer

    defense = ExtractionDefenseLayer.from_env()
    # Apply to a prediction response:
    result = defense.process_request(api_key, ip, features, model_name)
    perturbed = defense.process_response(api_key, raw_output, features)
"""

from .config import ExtractionDefenseConfig
from .rate_limiter import QueryRateLimiter, RateLimitCheck
from .pattern_detector import QueryPatternDetector, PatternAnalysis
from .output_perturbation import OutputPerturbationLayer
from .watermark import ModelWatermark
from .canary_detector import CanaryInputDetector, CanaryDetection
from .risk_scorer import ExtractionRiskScorer, RiskAssessment
from .defense_layer import ExtractionDefenseLayer

__all__ = [
    "ExtractionDefenseConfig",
    "ExtractionDefenseLayer",
    "QueryRateLimiter",
    "RateLimitCheck",
    "QueryPatternDetector",
    "PatternAnalysis",
    "OutputPerturbationLayer",
    "ModelWatermark",
    "CanaryInputDetector",
    "CanaryDetection",
    "ExtractionRiskScorer",
    "RiskAssessment",
]
