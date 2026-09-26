const NAVIGATION_FLOW = {
  entry: ['splash', 'login', 'auto-role-routing'],
  portals: {
    management: {
      dashboard: true,
      sections: {
        properties: ['properties-list', 'property-create', 'property-details', 'units-management'],
        contracts: ['active-contracts', 'expired-contracts', 'contract-create', 'contract-renewal'],
        owners: ['owners-list', 'owner-profile'],
        tenants: ['tenants-list', 'tenant-profile'],
        maintenance: ['maintenance-reports', 'work-orders', 'assign-technician'],
        finance: ['revenues', 'expenses', 'collections', 'transfers'],
        reports: ['reports-home'],
        settings: ['settings-home'],
      },
    },
    employee: {
      home: true,
      sections: {
        properties: ['properties-list', 'property-details'],
        units: ['units-available', 'units-rented'],
        contracts: ['contract-create', 'contract-edit', 'contract-renewal'],
        maintenance: ['intake-report', 'assign-to-technician', 'execution-follow-up'],
        collections: ['collections-home'],
        dailyTasks: ['daily-tasks-home'],
      },
    },
    owner: {
      home: true,
      sections: {
        myProperties: ['properties-list', 'property-details'],
        units: ['units-home'],
        contracts: ['contracts-home'],
        revenues: ['account-statement', 'owner-transfers', 'owner-profits'],
        maintenance: ['open-tickets', 'closed-tickets'],
        reports: ['owner-reports'],
      },
    },
    tenant: {
      home: true,
      sections: {
        myContract: ['contract-details', 'contract-download'],
        payments: ['payment-dues', 'online-payment', 'payment-history'],
        maintenanceRequests: ['maintenance-create', 'maintenance-track', 'maintenance-rate-service'],
        complaints: ['complaints-home'],
        notifications: ['notifications-home'],
        profile: ['profile-home'],
      },
      mobileBottomNav: ['home', 'contract', 'maintenance', 'payments', 'account'],
    },
    technician: {
      home: true,
      sections: {
        workOrders: ['new-orders', 'in-progress-orders', 'completed-orders'],
        taskDetails: ['property-data', 'tenant-data', 'upload-images', 'technical-report'],
        dailySchedule: ['daily-schedule-home'],
        profile: ['profile-home'],
      },
      mobileBottomNav: ['home', 'tasks', 'schedule', 'notifications', 'account'],
    },
  },
  workflows: {
    maintenance: [
      'tenant-create-request',
      'employee-receive-request',
      'employee-assign-technician',
      'technician-accept-task',
      'technician-execute-maintenance',
      'technician-upload-report-images',
      'employee-approve-completion',
      'notify-owner',
      'tenant-rate-service',
    ],
    contractCreation: [
      'employee-select-property',
      'employee-select-unit',
      'employee-enter-tenant-data',
      'employee-calculate-fees',
      'employee-create-contract',
      'management-approval',
      'tenant-signature',
      'activate-contract',
      'sync-contract-admin-owner-tenant',
    ],
  },
};

module.exports = {
  NAVIGATION_FLOW,
};
