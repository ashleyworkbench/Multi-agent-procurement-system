export const mockChartData = [
  { date: "Mon", requests: 14, pos: 10, cost: 3.8 },
  { date: "Tue", requests: 22, pos: 18, cost: 5.4 },
  { date: "Wed", requests: 19, pos: 15, cost: 4.1 },
  { date: "Thu", requests: 28, pos: 24, cost: 7.2 },
  { date: "Fri", requests: 35, pos: 30, cost: 8.9 },
  { date: "Sat", requests: 18, pos: 14, cost: 3.2 },
  { date: "Sun", requests: 12, pos: 9,  cost: 2.1 },
];

export const mockDataSources = [
  {
    id: "ds-1",
    name: "PostgreSQL - Construction DB",
    type: "Database Connection",
    status: "Connected",
  },
  {
    id: "ds-2",
    name: "PostgreSQL - Manufacturing DB",
    type: "Database Connection",
    status: "Connected",
  },
  {
    id: "ds-3",
    name: "MySQL - Pharma DB",
    type: "Database Connection",
    status: "Connected",
  },
  {
    id: "ds-4",
    name: "MySQL - Electronics DB",
    type: "Database Connection",
    status: "Connected",
  },
  {
    id: "ds-5",
    name: "Integration REST Gateway",
    type: "API Connection",
    status: "Connected",
  },
  {
    id: "ds-6",
    name: "MinIO Document Object Store",
    type: "Storage Connection",
    status: "Connected",
  },
  {
    id: "ds-7",
    name: "DocuSign eSignature Engine",
    type: "API Connection",
    status: "Connected",
  },
];
