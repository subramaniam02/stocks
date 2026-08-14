import PortfolioChart from '../components/PortfolioChart';
import InvestmentTimeline from '../components/InvestmentTimeline';
import PerformanceComparison from '../components/PerformanceComparison';
import PortfolioSummary from '../components/PortfolioSummary';
import PortfolioAllocation from '../components/PortfolioAllocation';

export default function HistoryPage({ portfolio, realized, onBackfillComplete, onTickerClick }) {
  return (
    <>
      <PortfolioSummary portfolio={portfolio} realized={realized} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <PerformanceComparison />
        <PortfolioChart onBackfillComplete={onBackfillComplete} />
      </div>
      <PortfolioAllocation portfolio={portfolio} onTickerClick={onTickerClick} />
      <InvestmentTimeline portfolio={portfolio} realized={realized} />
    </>
  );
}
