from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List


class HoldingBase(BaseModel):
    ticker: str
    purchase_date: date
    purchase_price: float
    quantity: float


class HoldingCreate(HoldingBase):
    pass


class Holding(HoldingBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class HoldingWithPerformance(Holding):
    current_price: float
    current_value: float
    cost_basis: float
    gain_loss: float
    gain_loss_pct: float
    price_stale: bool = False


class PortfolioSnapshotBase(BaseModel):
    snapshot_date: date
    ticker: str
    current_price: float
    total_value: float
    daily_change_pct: Optional[float] = None


class PortfolioSnapshot(PortfolioSnapshotBase):
    id: int

    class Config:
        from_attributes = True


class RecommendationBase(BaseModel):
    recommendation: str
    ticker: Optional[str] = None
    action_type: Optional[str] = None


class RecommendationCreate(RecommendationBase):
    pass


class Recommendation(RecommendationBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class PortfolioSummary(BaseModel):
    total_value: float
    total_cost_basis: float
    total_gain_loss: float
    total_gain_loss_pct: float
    holdings: List[HoldingWithPerformance]


class StockSummary(BaseModel):
    ticker: str
    name: Optional[str] = None
    total_quantity: float
    average_cost: float
    current_price: float
    total_value: float
    total_cost_basis: float
    gain_loss: float
    gain_loss_pct: float
    lots: List[HoldingWithPerformance]
    return_1d: Optional[float] = None
    return_1m: Optional[float] = None
    return_3m: Optional[float] = None
    return_6m: Optional[float] = None
    return_1y: Optional[float] = None
    return_3y: Optional[float] = None
    return_5y: Optional[float] = None
    price_stale: bool = False


class PortfolioOverview(BaseModel):
    total_value: float
    total_cost_basis: float
    total_gain_loss: float
    total_gain_loss_pct: float
    stocks: List[StockSummary]
    fetch_errors: Optional[List[str]] = None


class HistoricalDataPoint(BaseModel):
    date: date
    total_value: float
    daily_change_pct: Optional[float] = None


class ChatMessageItem(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    model: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    messages: List[ChatMessageItem]


class ChatSessionSummary(BaseModel):
    session_id: str
    created_at: str
    updated_at: str
    message_count: int
    preview: str


class RealizedTransactionCreate(BaseModel):
    ticker: str
    buy_date: date
    sell_date: date
    quantity: float
    buy_price: float
    sell_price: float
    notes: Optional[str] = None


class LotSaleItem(BaseModel):
    lot_id: int
    sell_price: float


class SellLotsRequest(BaseModel):
    lots: List[LotSaleItem]
    sell_date: date
    notes: Optional[str] = None


class WatchlistCreate(BaseModel):
    ticker: str


class WatchlistItem(BaseModel):
    id: int
    ticker: str
    created_at: datetime

    class Config:
        from_attributes = True


class AlertOut(BaseModel):
    id: int
    alert_type: str
    ticker: Optional[str] = None
    message: str
    value: Optional[float] = None
    threshold: Optional[float] = None
    triggered_at: datetime
    is_read: bool

    class Config:
        from_attributes = True


class AlertSettings(BaseModel):
    lot_crossing_enabled: bool
    portfolio_drop_enabled: bool
    must_act_enabled: bool
    market_close_review_enabled: bool
    daily_summary_enabled: bool
    weekly_summary_enabled: bool
    monthly_summary_enabled: bool


class AlertSettingsUpdate(BaseModel):
    lot_crossing_enabled: Optional[bool] = None
    portfolio_drop_enabled: Optional[bool] = None
    must_act_enabled: Optional[bool] = None
    market_close_review_enabled: Optional[bool] = None
    daily_summary_enabled: Optional[bool] = None
    weekly_summary_enabled: Optional[bool] = None
    monthly_summary_enabled: Optional[bool] = None
