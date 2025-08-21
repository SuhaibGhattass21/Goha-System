"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCw, 
  Loader2, 
  User, 
  Phone, 
  Calendar, 
  Package,
  AlertCircle,
  ShoppingCart,
  FileText,
  ShoppingBag
} from "lucide-react"
import { AuthApiService } from "@/lib/services/auth-api"
import { OrderStatus, CancelRequestStatus } from "@/lib/types/enums"

interface CancelRequest {
  cancelled_order_id: string
  order: {
    order_id: string
    customer_name?: string
    customer_phone?: string
    order_type: string
    total_price: number
    created_at: string
    table_number?: string
    status: OrderStatus
  }
  cancelled_by: {
    user_id: string
    username?: string
    full_name?: string
  }
  reason: string
  cancelled_at: string
  status: CancelRequestStatus
  order_items?: Array<{
    order_item_id: string
    product_size?: {
      product_name: string
      size_name?: string
      price: number
    }
    quantity: number
    unit_price: number
    extras?: Array<{
      name: string
      price: number
    }>
  }>
}

export default function CancelRequestsPage() {
  const [cancelRequests, setCancelRequests] = useState<CancelRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  
  const [pendingCount, setPendingCount] = useState(0)
  const [approvedCount, setApprovedCount] = useState(0)
  const [rejectedCount, setRejectedCount] = useState(0)

  useEffect(() => {
    fetchCancelRequests()
  }, [])

  const fetchCancelRequests = async () => {
    try {
      setLoading(true)
      setError(null)
      
      console.log("🔍 Fetching cancelled orders...")
      
      // Fetch all cancelled orders
      const result = await AuthApiService.apiRequest<any>(`/cancelled-orders?page=1&limit=100`)
      
      if (result.success && result.data) {
        const requests = result.data.cancelled_orders || result.data || []
        
        // Fetch order details for each request
        const requestsWithDetails = await Promise.all(
          requests.map(async (req: any) => {
            try {
              // Fetch basic order details
              const orderResult = await AuthApiService.apiRequest<any>(`/orders/${req.order.order_id}`)
              
              let orderData = req.order
              let orderItems: any[] = []
              
              if (orderResult.success && orderResult.data) {
                orderData = orderResult.data.order || orderResult.data
                
                // Fetch order items
                try {
                  const itemsResult = await AuthApiService.apiRequest<any>(`/order-items/order/${req.order.order_id}`)
                  if (itemsResult.success && itemsResult.data) {
                    orderItems = Array.isArray(itemsResult.data) ? itemsResult.data : []
                  }
                } catch (itemsError) {
                  console.warn(`Failed to fetch items for order ${req.order.order_id}`)
                }
              }
              
              return {
                cancelled_order_id: req.cancelled_order_id,
                order: {
                  order_id: orderData.order_id,
                  customer_name: orderData.customer_name || 'عميل غير محدد',
                  customer_phone: orderData.customer_phone || orderData.phone_number,
                  order_type: orderData.order_type,
                  total_price: Number(orderData.total_price || 0),
                  created_at: orderData.created_at,
                  table_number: orderData.table_number,
                  status: orderData.status as OrderStatus
                },
                cancelled_by: {
                  user_id: req.cancelled_by.id || req.cancelled_by.user_id,
                  username: req.cancelled_by.username,
                  full_name: req.cancelled_by.fullName || req.cancelled_by.full_name
                },
                reason: req.reason || 'لا يوجد سبب محدد',
                cancelled_at: req.cancelled_at,
                status: (req.status || 'pending') as CancelRequestStatus,
                order_items: orderItems.map((item: any) => ({
                  order_item_id: item.order_item_id,
                  product_size: {
                    product_name: item.product_size?.product_name || 'منتج غير محدد',
                    size_name: item.product_size?.size_name || 'عادي',
                    price: Number(item.product_size?.price || item.unit_price || 0)
                  },
                  quantity: item.quantity || 1,
                  unit_price: Number(item.unit_price || 0),
                  extras: item.extras?.map((extra: any) => ({
                    name: extra.name || extra.extra_name,
                    price: Number(extra.price || 0)
                  })) || []
                }))
              }
            } catch (error) {
              console.warn(`Failed to fetch details for request ${req.cancelled_order_id}:`, error)
              return null
            }
          })
        )
        
        // Filter out failed requests
        const validRequests = requestsWithDetails.filter(req => req !== null) as CancelRequest[]
        
        setCancelRequests(validRequests)
        
        // Calculate counts
        setPendingCount(validRequests.filter(req => req.status === CancelRequestStatus.PENDING).length)
        setApprovedCount(validRequests.filter(req => req.status === CancelRequestStatus.APPROVED).length)
        setRejectedCount(validRequests.filter(req => req.status === CancelRequestStatus.REJECTED).length)
        
        console.log(`✅ Loaded ${validRequests.length} cancel requests`)
      }
      
    } catch (error: any) {
      console.error("❌ Error fetching cancel requests:", error)
      setError(error.message || 'فشل في تحميل طلبات الإلغاء')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (request: CancelRequest) => {
    try {
      setProcessingId(request.cancelled_order_id)
      
      // Get current user
      const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}")
      const approvedBy = currentUser?.user_id || currentUser?.worker_id
      
      console.log(`✅ Approving cancel request: ${request.cancelled_order_id}`)
      
      // Approve the cancellation request
      const result = await AuthApiService.apiRequest<any>(
        `/cancelled-orders/${request.cancelled_order_id}/approve`,
        {
          method: "POST",
          body: JSON.stringify({
            approved_by: approvedBy
          })
        }
      )
      
      if (result.success) {
        // Update local state
        setCancelRequests(prev => prev.map(req => 
          req.cancelled_order_id === request.cancelled_order_id 
            ? { ...req, status: CancelRequestStatus.APPROVED }
            : req
        ))
        
        // Update counts
        setPendingCount(prev => prev - 1)
        setApprovedCount(prev => prev + 1)
        
        console.log(`✅ Cancel request approved successfully`)
        
        // Refresh data
        setTimeout(fetchCancelRequests, 1000)
      } else {
        throw new Error(result.message || "فشل في الموافقة على الطلب")
      }
      
    } catch (error: any) {
      console.error("❌ Error approving request:", error)
      alert(`❌ فشل في قبول طلب الإلغاء: ${error.message}`)
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (request: CancelRequest) => {
    try {
      setProcessingId(request.cancelled_order_id)
      
      // Get current user
      const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}")
      const rejectedBy = currentUser?.user_id || currentUser?.worker_id
      
      console.log(`❌ Rejecting cancel request: ${request.cancelled_order_id}`)
      
      // Call the reject endpoint
      const result = await AuthApiService.apiRequest<any>(
        `/cancelled-orders/${request.cancelled_order_id}/reject`,
        {
          method: "POST",
          body: JSON.stringify({
            approved_by: rejectedBy,
            rejection_reason: "Order cancellation rejected by owner"
          })
        }
      )
      
      if (result.success) {
        // Update local state - order should be active again
        setCancelRequests(prev => prev.map(req => 
          req.cancelled_order_id === request.cancelled_order_id 
            ? { 
                ...req, 
                status: CancelRequestStatus.REJECTED,
                order: {
                  ...req.order,
                  status: OrderStatus.ACTIVE // Order becomes active again
                }
              }
            : req
        ))
        
        // Update counts
        setPendingCount(prev => prev - 1)
        setRejectedCount(prev => prev + 1)
        
        console.log(`✅ Cancel request rejected successfully - Order is now active again`)
        
        // Dispatch event to notify cashier page about rejection
        window.dispatchEvent(new CustomEvent("orderCancellationRejected", {
          detail: { orderId: request.order.order_id }
        }))
        
        // Show success message
        alert(`✅ تم رفض طلب الإلغاء بنجاح. الطلب #${request.order.order_id.slice(-6)} أصبح نشطاً مرة أخرى.`)
        
        // Refresh data to get latest status
        setTimeout(fetchCancelRequests, 1000)
        
      } else {
        throw new Error(result.message || "فشل في رفض طلب الإلغاء")
      }
      
    } catch (error: any) {
      console.error("❌ Error rejecting request:", error)
      alert(`❌ فشل في رفض طلب الإلغاء: ${error.message}`)
    } finally {
      setProcessingId(null)
    }
  }

  const formatPrice = (price: number) => {
    return `${price.toFixed(2)} جنيه`
  }

  const getStatusBadge = (status: CancelRequestStatus) => {
    switch (status) {
      case CancelRequestStatus.PENDING:
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" />معلق</Badge>
      case CancelRequestStatus.APPROVED:
        return <Badge variant="default" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" />موافق عليه</Badge>
      case CancelRequestStatus.REJECTED:
        return <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" />مرفوض</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getOrderTypeName = (type: string) => {
    const types: Record<string, string> = {
      'dine-in': 'صالة',
      'takeaway': 'تيك أواي', 
      'delivery': 'توصيل',
      'cafe': 'كافيه'
    }
    return types[type] || type
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>جاري تحميل طلبات الإلغاء...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">خطأ في تحميل البيانات</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={fetchCancelRequests}>
              <RefreshCw className="w-4 h-4 mr-2" />
              إعادة المحاولة
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">طلبات إلغاء الطلبات</h1>
          <p className="text-gray-600">إدارة طلبات الإلغاء من الكاشيرين</p>
        </div>
        <Button onClick={fetchCancelRequests} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">طلبات معلقة</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">طلبات موافق عليها</p>
                <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">طلبات مرفوضة</p>
                <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cancel Requests List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            جميع طلبات الإلغاء ({cancelRequests.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cancelRequests.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">لا توجد طلبات إلغاء</h3>
              <p className="text-gray-600">لم يتم العثور على أي طلبات إلغاء حتى الآن</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cancelRequests.map((request) => (
                <Card key={request.cancelled_order_id} className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-lg">
                            طلب #{request.order.order_id.slice(-6)}
                          </h3>
                          {getStatusBadge(request.status)}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(request.cancelled_at).toLocaleDateString('ar-EG')}
                        </div>
                      </div>

                      {/* Order Info */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-3 rounded-lg">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-500" />
                          <div>
                            <p className="text-xs text-gray-500">العميل</p>
                            <p className="font-medium">{request.order.customer_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-gray-500" />
                          <div>
                            <p className="text-xs text-gray-500">نوع الطلب</p>
                            <p className="font-medium">{getOrderTypeName(request.order.order_type)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-500" />
                          <div>
                            <p className="text-xs text-gray-500">المبلغ</p>
                            <p className="font-medium">{formatPrice(request.order.total_price)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Cancellation Details */}
                      <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-red-700 mb-1">سبب الإلغاء:</p>
                            <p className="text-sm text-red-600">{request.reason}</p>
                            <p className="text-xs text-red-500 mt-1">
                              طلب من: {request.cancelled_by.full_name || request.cancelled_by.username}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Order Items - Enhanced Display */}
                      {request.order_items && request.order_items.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <ShoppingBag className="h-4 w-4" />
                            عناصر الطلب ({request.order_items.length})
                          </div>
                          
                          <div className="grid gap-3">
                            {request.order_items.map((item, index) => (
                              <div key={item.order_item_id || index} className="bg-gray-50 rounded-lg p-4 border">
                                <div className="flex justify-between items-start mb-3">
                                  <div className="flex-1">
                                    <h5 className="font-medium text-gray-900 mb-1">
                                      {item.product_size?.product_name || 'منتج غير محدد'}
                                    </h5>
                                    <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                                      {item.product_size?.size_name && (
                                        <span className="bg-blue-100 px-2 py-1 rounded">
                                          {item.product_size.size_name}
                                        </span>
                                      )}
                                      {item.extras && item.extras.length > 0 && (
                                        <span className="bg-green-100 px-2 py-1 rounded">
                                          +{item.extras.length} إضافات
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-left">
                                    <div className="text-lg font-bold text-green-600">
                                      {formatPrice(item.quantity * item.unit_price)}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      {item.quantity} × {formatPrice(item.unit_price)}
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Extras Details */}
                                {item.extras && item.extras.length > 0 && (
                                  <div className="mt-3 pt-3 border-t border-gray-200">
                                    <div className="text-sm font-medium text-gray-700 mb-2">الإضافات:</div>
                                    <div className="grid gap-1">
                                      {item.extras.map((extra, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-sm">
                                          <span className="text-gray-600">+ {extra.name}</span>
                                          <span className="text-gray-800 font-medium">
                                            {extra.price ? formatPrice(extra.price) : 'مجاني'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {request.status === CancelRequestStatus.PENDING && (
                        <div className="flex gap-2 pt-2">
                          <Button 
                            onClick={() => handleApprove(request)}
                            disabled={processingId === request.cancelled_order_id}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {processingId === request.cancelled_order_id ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                              <CheckCircle className="w-4 h-4 mr-2" />
                            )}
                            موافقة
                          </Button>
                          <Button 
                            onClick={() => handleReject(request)}
                            disabled={processingId === request.cancelled_order_id}
                            variant="destructive"
                          >
                            {processingId === request.cancelled_order_id ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                              <XCircle className="w-4 h-4 mr-2" />
                            )}
                            رفض
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
