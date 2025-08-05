import { Analytics } from '@/types/admin';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LineElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  LineElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
);

interface AnalyticsChartsProps {
  analytics: Analytics;
  timeframe: 'day' | 'week' | 'month';
  onChangeTimeframe: (newTimeframe: 'day' | 'week' | 'month') => void;
  page: number;
  onPageChange: (newPage: number) => void;
  totalItems: number;
  itemsPerPage: number;
}

const defaultChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
    },
    tooltip: {
      mode: 'index' as const,
      intersect: false,
    },
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
    },
    y: {
      grid: {
        drawBorder: false,
        color: '#374151',
      },
    },
  },
};

export default function AnalyticsCharts({ analytics, timeframe, onChangeTimeframe, page, onPageChange, totalItems, itemsPerPage }: AnalyticsChartsProps) {
  const messagesData = {
    labels: analytics.messagesPerDay.map(d => d.date),
    datasets: [
      {
        label: 'Messages',
        data: analytics.messagesPerDay.map(d => d.count),
        borderColor: '#D4AF37',
        backgroundColor: 'rgba(212, 175, 55, 0.1)',
        tension: 0.4,
      },
    ],
  };

  const devicesData = {
    labels: analytics.activeDevicesPerDay.map(d => d.date),
    datasets: [
      {
        label: 'Active Devices',
        data: analytics.activeDevicesPerDay.map(d => d.count),
        backgroundColor: '#D4AF37',
      },
    ],
  };

  const callsData = {
    labels: analytics.callMinutesPerDay.map(d => d.date),
    datasets: [
      {
        label: 'Call Minutes',
        data: analytics.callMinutesPerDay.map(d => d.minutes),
        borderColor: '#36D399',
        backgroundColor: 'rgba(54, 211, 153, 0.1)',
        tension: 0.4,
      },
    ],
  };

  const deviceTypesData = {
    labels: analytics.deviceTypes.map(d => d.type),
    datasets: [
      {
        label: 'Device Types',
        data: analytics.deviceTypes.map(d => d.count),
        backgroundColor: [
          '#D4AF37',
          '#36D399',
          '#3ABFF8',
          '#FBBD23',
        ],
      },
    ],
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">Filter and Pagination</h3>
        </div>
        <div className="flex justify-between items-center">
          <select value={timeframe} onChange={(e) => onChangeTimeframe(e.target.value as 'day' | 'week' | 'month')} className="select-filter">
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
          <div className="pagination">
            {Array.from({ length: Math.ceil(totalItems / itemsPerPage) }, (_, i) => (  
              <button key={i} onClick={() => onPageChange(i + 1)} className={
                `pagination-button ${page === i + 1 ? 'active' : ''}`
              }>{i + 1}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">Messages per Day</h3>
        </div>
        <div className="admin-chart-container">
          <Line data={messagesData} options={defaultChartOptions} />
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">Active Devices per Day</h3>
        </div>
        <div className="admin-chart-container">
          <Bar data={devicesData} options={defaultChartOptions} />
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">Call Minutes per Day</h3>
        </div>
        <div className="admin-chart-container">
          <Line data={callsData} options={defaultChartOptions} />
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">Device Types Distribution</h3>
        </div>
        <div className="admin-chart-container">
          <Bar data={deviceTypesData} options={defaultChartOptions} />
        </div>
      </div>
    </div>
  );
}
