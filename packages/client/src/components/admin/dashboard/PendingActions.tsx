import React, { useState, useEffect } from 'react';
import { 
  FiUserPlus,
  FiSmartphone,
  FiCheckCircle,
  FiClock,
  FiCheck,
  FiX
} from 'react-icons/fi';
import { apiClient } from '@/lib/api';
import { PendingApproval } from '@/types/admin';

export default function PendingActions() {
  const [approvals, setApprovals] = useState<PendingApproval[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    getPendingApprovals();
  }, []);

  const getPendingApprovals = async () => {
    try {
      setLoading(true);
      const pendingApprovals = await apiClient.getPendingApprovals();
      setApprovals(pendingApprovals);
    } catch (error) {
      console.error('Failed to fetch pending approvals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (approvalId: string, approved: boolean, reason = '') => {
    try {
      setActionLoading(approvalId);
      await apiClient.approveRequest(approvalId, approved, reason);
      // Refresh the list
      await getPendingApprovals();
    } catch (error) {
      console.error('Failed to process approval:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const getApprovalIcon = (type: string) => {
    return type === 'device' ? FiSmartphone : FiUserPlus;
  };

  const getRiskColor = (score: number) => {
    if (score >= 80) return 'text-error';
    if (score >= 50) return 'text-warning';
    return 'text-success';
  };

  if (loading) {
    return (
      <div className="admin-card animate-pulse">
        <div className="h-4 bg-base-300 rounded mb-4"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-base-300 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-base-300 rounded-full"></div>
                <div>
                  <div className="h-3 bg-base-300 rounded mb-2 w-32"></div>
                  <div className="h-2 bg-base-300 rounded w-24"></div>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-16 h-6 bg-base-300 rounded"></div>
                <div className="w-16 h-6 bg-base-300 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h3 className="admin-card-title">
          <FiClock className="w-5 h-5" />
          Pending Approvals
        </h3>
        <div className="admin-badge">
          {approvals?.length || 0}
        </div>
      </div>
      
      <div className="space-y-3">
        {approvals && approvals.length > 0 ? (
          approvals.map((approval) => {
            const Icon = getApprovalIcon(approval.type);
            return (
              <div key={approval._id} className="p-3 bg-base-300/50 rounded-lg border border-base-300">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-base-content">
                          {approval.type === 'device' ? 'Device Registration' : 'User Registration'}
                        </p>
                        <div className={`admin-badge text-xs ${getRiskColor(approval.riskScore)}`}>
                          Risk: {approval.riskScore}
                        </div>
                      </div>
                      <p className="text-xs text-base-content/70 mb-2">
                        {approval.user.displayName} ({approval.user.email})
                      </p>
                      <div className="text-xs text-base-content/60">
                        <p>IP: {approval.ipAddress}</p>
                        {approval.location && (
                          <p>Location: {approval.location.city}, {approval.location.country}</p>
                        )}
                        <p>Requested: {new Date(approval.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleApproval(approval._id, false, 'Rejected by admin')}
                      disabled={actionLoading === approval._id}
                      className="admin-btn-danger btn-sm"
                    >
                      {actionLoading === approval._id ? (
                        <div className="admin-loading w-4 h-4"></div>
                      ) : (
                        <FiX className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleApproval(approval._id, true, 'Approved by admin')}
                      disabled={actionLoading === approval._id}
                      className="admin-btn-success btn-sm"
                    >
                      {actionLoading === approval._id ? (
                        <div className="admin-loading w-4 h-4"></div>
                      ) : (
                        <FiCheck className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                
                {approval.reasons.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-base-300">
                    <p className="text-xs font-medium text-base-content mb-2">Risk Factors:</p>
                    <div className="flex flex-wrap gap-1">
                      {approval.reasons.map((reason, index) => (
                        <span key={index} className="admin-badge-warning text-xs px-2 py-1">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-base-content/60">
            <FiCheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No pending approvals</p>
          </div>
        )}
      </div>
    </div>
  );
}
