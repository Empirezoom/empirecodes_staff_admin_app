import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  StatusBar,
  Linking,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';

const DEFAULT_API_HOST = 'https://empirecodes-backend-drf.onrender.com';

const STAFF_PASSCODE = '2026'; // Default staff gate PIN

export default function App() {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');

  // API Host & Connectivity State
  const [apiHost, setApiHost] = useState(DEFAULT_API_HOST);
  const [customHost, setCustomHost] = useState(DEFAULT_API_HOST);
  const [isServerOnline, setIsServerOnline] = useState(false);
  const [showHostModal, setShowHostModal] = useState(false);

  // Active Tab: leads | orders | chat | reviews
  const [activeTab, setActiveTab] = useState('leads');

  // Leads State
  const [leads, setLeads] = useState([]);
  const [leadFilter, setLeadFilter] = useState('all'); // all | new | in_progress | closed
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);

  // Contract Bookings State
  const [bookings, setBookings] = useState([]);
  const [bookingFilter, setBookingFilter] = useState('all'); // all | pending | accepted | in_progress | completed
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);

  // Live Contract Chat State
  const [activeChatBooking, setActiveChatBooking] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isRefreshingChat, setIsRefreshingChat] = useState(false);

  // Reviews Moderation State
  const [reviews, setReviews] = useState([]);
  const [reviewFilter, setReviewFilter] = useState('all'); // all | pending | approved
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);

  // Auto-scroll chat ref
  const chatScrollRef = useRef(null);

  // ─────────────────────────────────────────────────────────────
  // LIFECYCLE & POLLING
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isAuthenticated) {
      checkServerHealth();
      fetchLeads();
      fetchBookings();
      fetchReviews();
    }
  }, [isAuthenticated, apiHost]);

  // Chat Poller
  useEffect(() => {
    let interval = null;
    if (isAuthenticated && activeChatBooking) {
      fetchChatMessages(activeChatBooking.id, false);
      interval = setInterval(() => {
        fetchChatMessages(activeChatBooking.id, false);
      }, 4000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAuthenticated, activeChatBooking, apiHost]);

  // ─────────────────────────────────────────────────────────────
  // NETWORK CALLS
  // ─────────────────────────────────────────────────────────────
  const checkServerHealth = async () => {
    try {
      const res = await fetch(`${apiHost}/api/dashboard/`);
      setIsServerOnline(res.ok);
    } catch (e) {
      setIsServerOnline(false);
    }
  };

  const fetchLeads = async () => {
    setIsLoadingLeads(true);
    try {
      const res = await fetch(`${apiHost}/api/leads/`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (e) {
      console.log('Error fetching leads', e);
    } finally {
      setIsLoadingLeads(false);
    }
  };

  const updateLeadStatus = async (leadId, newStatus) => {
    try {
      const res = await fetch(`${apiHost}/api/leads/${leadId}/update_status/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
        );
      }
    } catch (e) {
      Alert.alert('Update Failed', 'Could not update lead status.');
    }
  };

  const fetchBookings = async () => {
    setIsLoadingBookings(true);
    try {
      const res = await fetch(`${apiHost}/api/bookings/`);
      if (res.ok) {
        const data = await res.json();
        setBookings(data);
      }
    } catch (e) {
      console.log('Error fetching bookings', e);
    } finally {
      setIsLoadingBookings(false);
    }
  };

  const updateBookingStatus = async (bookingId, newStatus) => {
    try {
      const res = await fetch(`${apiHost}/api/bookings/${bookingId}/update_status/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setBookings((prev) =>
          prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
        );
        if (activeChatBooking && activeChatBooking.id === bookingId) {
          setActiveChatBooking((prev) => ({ ...prev, status: newStatus }));
        }
        Alert.alert('Status Updated', `Contract #${bookingId} is now '${newStatus.toUpperCase()}'.`);
      }
    } catch (e) {
      Alert.alert('Update Failed', 'Could not update booking status.');
    }
  };

  const fetchChatMessages = async (bookingId, showSpinner = true) => {
    if (showSpinner) setIsRefreshingChat(true);
    try {
      const res = await fetch(`${apiHost}/api/bookings/${bookingId}/messages/`);
      if (res.ok) {
        const msgs = await res.json();
        setChatMessages(msgs);
      }
    } catch (e) {
      // Graceful
    } finally {
      if (showSpinner) setIsRefreshingChat(false);
    }
  };

  const sendStaffMessage = async () => {
    if (!chatInput.trim() || !activeChatBooking) return;
    const textToSend = chatInput.trim();
    setChatInput('');
    setIsSendingMessage(true);
    try {
      const payload = {
        sender_name: 'Anthony (Staff Architect)',
        message: textToSend,
        is_staff: true,
      };
      const res = await fetch(`${apiHost}/api/bookings/${activeChatBooking.id}/messages/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const saved = await res.json();
        setChatMessages((prev) => [...prev, saved]);
        chatScrollRef.current?.scrollToEnd({ animated: true });
      }
    } catch (e) {
      Alert.alert('Message Failed', 'Could not send staff message.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const fetchReviews = async () => {
    setIsLoadingReviews(true);
    try {
      const res = await fetch(`${apiHost}/api/reviews/`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data);
      }
    } catch (e) {
      console.log('Error fetching reviews', e);
    } finally {
      setIsLoadingReviews(false);
    }
  };

  const toggleReviewApproval = async (reviewId) => {
    try {
      const res = await fetch(`${apiHost}/api/reviews/${reviewId}/toggle_approval/`, {
        method: 'POST',
      });
      if (res.ok) {
        const resData = await res.json();
        setReviews((prev) =>
          prev.map((r) =>
            r.id === reviewId ? { ...r, is_approved: resData.is_approved } : r
          )
        );
      }
    } catch (e) {
      Alert.alert('Action Failed', 'Could not toggle review approval.');
    }
  };

  // ─────────────────────────────────────────────────────────────
  // PASSCODE GATE SCREEN
  // ─────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#020202" />
        <View style={styles.authCard}>
          <Text style={styles.authEmblem}>🛡️</Text>
          <Text style={styles.authTitle}>EMPIRECODES STAFF DESK</Text>
          <Text style={styles.authSub}>Operational Control • Lead Dispatch • Client Chat</Text>

          <View style={styles.authInputBox}>
            <TextInput
              style={styles.authTextInput}
              value={passcodeInput}
              onChangeText={setPasscodeInput}
              placeholder="Enter Staff Passcode (2026)"
              placeholderTextColor="#555"
              keyboardType="numeric"
              secureTextEntry
              onSubmitEditing={() => {
                if (passcodeInput.trim() === STAFF_PASSCODE) {
                  setIsAuthenticated(true);
                } else {
                  Alert.alert('Access Denied', 'Invalid staff credentials.');
                }
              }}
            />
          </View>

          <TouchableOpacity
            style={styles.authSubmitBtn}
            onPress={() => {
              if (passcodeInput.trim() === STAFF_PASSCODE) {
                setIsAuthenticated(true);
              } else {
                Alert.alert('Access Denied', 'Invalid staff credentials.');
              }
            }}
          >
            <Text style={styles.authSubmitBtnText}>ENTER STAFF CONSOLE ⚡</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // MAIN STAFF CONSOLE SCREEN
  // ─────────────────────────────────────────────────────────────
  const newLeadsCount = leads.filter((l) => l.status === 'new').length;
  const pendingOrdersCount = bookings.filter((b) => b.status === 'pending').length;
  const pendingReviewsCount = reviews.filter((r) => !r.is_approved).length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#020202" />

      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>EMPIRECODES STAFF DESK</Text>
          <View style={styles.headerSubtitleRow}>
            <View style={[styles.pulseDot, isServerOnline ? styles.pulseGreen : styles.pulseRed]} />
            <Text style={styles.headerSubtitle}>
              {isServerOnline ? 'CORE CLOUD ONLINE' : 'CONNECTING...'}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.hostBtn}
            onPress={() => setShowHostModal(true)}
          >
            <Text style={styles.hostBtnText}>⚙️ API</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.lockBtn}
            onPress={() => setIsAuthenticated(false)}
          >
            <Text style={styles.lockBtnText}>🔒</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Vitals Summary Strip */}
      <View style={styles.vitalsStrip}>
        <View style={styles.vitalBox}>
          <Text style={styles.vitalLabel}>NEW LEADS</Text>
          <Text style={[styles.vitalVal, { color: '#3dff8b' }]}>{newLeadsCount}</Text>
        </View>
        <View style={styles.vitalBox}>
          <Text style={styles.vitalLabel}>PENDING ORDERS</Text>
          <Text style={[styles.vitalVal, { color: '#d4af37' }]}>{pendingOrdersCount}</Text>
        </View>
        <View style={styles.vitalBox}>
          <Text style={styles.vitalLabel}>PENDING REVIEWS</Text>
          <Text style={[styles.vitalVal, { color: '#00dcff' }]}>{pendingReviewsCount}</Text>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'leads' && styles.tabBtnActive]}
          onPress={() => setActiveTab('leads')}
        >
          <Text style={[styles.tabText, activeTab === 'leads' && styles.tabTextActive]}>
            📋 LEADS ({leads.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'orders' && styles.tabBtnActive]}
          onPress={() => setActiveTab('orders')}
        >
          <Text style={[styles.tabText, activeTab === 'orders' && styles.tabTextActive]}>
            📦 ORDERS ({bookings.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'chat' && styles.tabBtnActive]}
          onPress={() => setActiveTab('chat')}
        >
          <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>
            💬 CHAT {activeChatBooking ? `(#${activeChatBooking.id})` : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'reviews' && styles.tabBtnActive]}
          onPress={() => setActiveTab('reviews')}
        >
          <Text style={[styles.tabText, activeTab === 'reviews' && styles.tabTextActive]}>
            ⭐ REVIEWS ({reviews.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* TAB CONTENT */}
      <ScrollView contentContainerStyle={styles.contentArea}>
        {/* ═══════════════════════════════════════════════════════════
            TAB 1: INCOMING LEADS PIPELINE
            ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'leads' && (
          <View>
            {/* Filter Pills */}
            <View style={styles.filterRow}>
              {['all', 'new', 'contacted', 'in_progress', 'closed'].map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, leadFilter === f && styles.filterChipActive]}
                  onPress={() => setLeadFilter(f)}
                >
                  <Text style={[styles.filterChipText, leadFilter === f && styles.filterChipTextActive]}>
                    {f.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.refreshBtn} onPress={fetchLeads}>
                <Text style={styles.refreshBtnText}>🔄</Text>
              </TouchableOpacity>
            </View>

            {isLoadingLeads ? (
              <ActivityIndicator color="#d4af37" style={{ marginTop: 20 }} />
            ) : leads.filter((l) => leadFilter === 'all' || l.status === leadFilter).length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>No leads match this filter.</Text>
              </View>
            ) : (
              leads
                .filter((l) => leadFilter === 'all' || l.status === leadFilter)
                .map((lead) => (
                  <View key={lead.id} style={styles.leadCard}>
                    <View style={styles.leadHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.leadName}>{lead.name}</Text>
                        <Text style={styles.leadEmail}>{lead.email}</Text>
                        {lead.phone ? (
                          <Text style={styles.leadPhone}>WhatsApp: {lead.phone}</Text>
                        ) : null}
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          lead.status === 'new'
                            ? styles.statusBadgeNew
                            : lead.status === 'in_progress'
                            ? styles.statusBadgeProgress
                            : styles.statusBadgeClosed,
                        ]}
                      >
                        <Text style={styles.statusBadgeText}>{lead.status.toUpperCase()}</Text>
                      </View>
                    </View>

                    <Text style={styles.leadService}>Domain: {lead.service_requested}</Text>
                    <Text style={styles.leadMessage}>"{lead.message}"</Text>

                    {/* Quick Dispatch Buttons */}
                    <View style={styles.dispatchRow}>
                      <TouchableOpacity
                        style={styles.whatsappDispatchBtn}
                        onPress={() => {
                          const cleanPhone = (lead.phone || '').replace(/[^0-9]/g, '');
                          const text = `Hello ${lead.name}, this is Anthony from EmpireCodes regarding your inquiry on '${lead.service_requested}'.`;
                          Linking.openURL(`https://wa.me/${cleanPhone || '2348173057810'}?text=${encodeURIComponent(text)}`);
                        }}
                      >
                        <Text style={styles.whatsappDispatchBtnText}>💬 WHATSAPP CLIENT</Text>
                      </TouchableOpacity>

                      {lead.phone ? (
                        <TouchableOpacity
                          style={styles.callDispatchBtn}
                          onPress={() => Linking.openURL(`tel:${lead.phone}`)}
                        >
                          <Text style={styles.callDispatchBtnText}>📞 CALL</Text>
                        </TouchableOpacity>
                      ) : null}

                      <TouchableOpacity
                        style={styles.emailDispatchBtn}
                        onPress={() =>
                          Linking.openURL(
                            `mailto:${lead.email}?subject=EmpireCodes Architectural Proposal`
                          )
                        }
                      >
                        <Text style={styles.emailDispatchBtnText}>✉️ EMAIL</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Status Changer */}
                    <View style={styles.statusChangeRow}>
                      <Text style={styles.statusChangeLabel}>Set Status:</Text>
                      {['new', 'contacted', 'in_progress', 'closed'].map((s) => (
                        <TouchableOpacity
                          key={s}
                          style={[
                            styles.statusMiniBtn,
                            lead.status === s && styles.statusMiniBtnActive,
                          ]}
                          onPress={() => updateLeadStatus(lead.id, s)}
                        >
                          <Text
                            style={[
                              styles.statusMiniBtnText,
                              lead.status === s && styles.statusMiniBtnTextActive,
                            ]}
                          >
                            {s}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════
            TAB 2: CONTRACT ORDERS MANAGEMENT
            ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'orders' && (
          <View>
            <View style={styles.filterRow}>
              {['all', 'pending', 'accepted', 'in_progress', 'audit', 'completed'].map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, bookingFilter === f && styles.filterChipActive]}
                  onPress={() => setBookingFilter(f)}
                >
                  <Text style={[styles.filterChipText, bookingFilter === f && styles.filterChipTextActive]}>
                    {f.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.refreshBtn} onPress={fetchBookings}>
                <Text style={styles.refreshBtnText}>🔄</Text>
              </TouchableOpacity>
            </View>

            {isLoadingBookings ? (
              <ActivityIndicator color="#d4af37" style={{ marginTop: 20 }} />
            ) : bookings.filter((b) => bookingFilter === 'all' || b.status === bookingFilter).length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>No contract bookings match this filter.</Text>
              </View>
            ) : (
              bookings
                .filter((b) => bookingFilter === 'all' || b.status === bookingFilter)
                .map((bk) => (
                  <View key={bk.id} style={styles.orderCard}>
                    <View style={styles.orderCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.orderIdBadge}>ORDER #{bk.id}</Text>
                        <Text style={styles.orderTitle}>{bk.service_title}</Text>
                        <Text style={styles.orderClient}>
                          Client: {bk.client_name} ({bk.client_email})
                        </Text>
                        <Text style={styles.orderPhone}>WhatsApp: {bk.client_phone}</Text>
                      </View>
                      <View style={styles.orderStatusPill}>
                        <Text style={styles.orderStatusPillText}>{bk.status.toUpperCase()}</Text>
                      </View>
                    </View>

                    <View style={styles.orderMetaRow}>
                      <Text style={styles.orderMeta}>Tier: <Text style={{ color: '#fff' }}>{bk.budget_tier}</Text></Text>
                      <Text style={styles.orderMeta}>Timeline: <Text style={{ color: '#fff' }}>{bk.timeline}</Text></Text>
                    </View>

                    <Text style={styles.orderScope}>{bk.project_scope}</Text>

                    {/* Action Row */}
                    <View style={styles.orderActionRow}>
                      <TouchableOpacity
                        style={styles.chatActionBtn}
                        onPress={() => {
                          setActiveChatBooking(bk);
                          fetchChatMessages(bk.id);
                          setActiveTab('chat');
                        }}
                      >
                        <Text style={styles.chatActionBtnText}>💬 OPEN STAFF CHAT DESK</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.waContractBtn}
                        onPress={() => {
                          const cleanPhone = (bk.client_phone || '').replace(/[^0-9]/g, '');
                          Linking.openURL(
                            `https://wa.me/${cleanPhone || '2348173057810'}?text=${encodeURIComponent(
                              `Hello ${bk.client_name}, this is EmpireCodes updating you on Contract #${bk.id} (${bk.service_title}).`
                            )}`
                          );
                        }}
                      >
                        <Text style={styles.waContractBtnText}>💬 WHATSAPP</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Quick Status Advance */}
                    <View style={styles.statusChangeRow}>
                      <Text style={styles.statusChangeLabel}>Advance Contract:</Text>
                      {['accepted', 'in_progress', 'audit', 'completed'].map((s) => (
                        <TouchableOpacity
                          key={s}
                          style={[
                            styles.statusMiniBtn,
                            bk.status === s && styles.statusMiniBtnActive,
                          ]}
                          onPress={() => updateBookingStatus(bk.id, s)}
                        >
                          <Text
                            style={[
                              styles.statusMiniBtnText,
                              bk.status === s && styles.statusMiniBtnTextActive,
                            ]}
                          >
                            {s}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════
            TAB 3: LIVE STAFF CHAT CONSOLE
            ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'chat' && (
          <View>
            {!activeChatBooking ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>No active contract selected for chat.</Text>
                <Text style={styles.emptyCardSub}>
                  Go to the ORDERS tab and tap "OPEN STAFF CHAT DESK" on any client booking.
                </Text>
              </View>
            ) : (
              <View style={styles.chatConsoleContainer}>
                {/* Chat Top Banner */}
                <View style={styles.chatConsoleBanner}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chatConsoleOrderTitle}>
                      ORDER #{activeChatBooking.id} • {activeChatBooking.service_title}
                    </Text>
                    <Text style={styles.chatConsoleClientSub}>
                      Client: {activeChatBooking.client_name} ({activeChatBooking.client_email})
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.chatRefreshBtn}
                    onPress={() => fetchChatMessages(activeChatBooking.id)}
                  >
                    <Text style={styles.chatRefreshBtnText}>
                      {isRefreshingChat ? '...' : '🔄 REFRESH'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Messages Feed */}
                <ScrollView
                  ref={chatScrollRef}
                  style={styles.chatFeed}
                  onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
                >
                  {chatMessages.length === 0 ? (
                    <Text style={styles.noChatText}>
                      No messages on this contract yet. Reply below to initiate client dialogue.
                    </Text>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <View
                        key={msg.id || idx}
                        style={[
                          styles.chatBubbleRow,
                          msg.is_staff ? styles.bubbleRowStaff : styles.bubbleRowClient,
                        ]}
                      >
                        <View
                          style={[
                            styles.bubble,
                            msg.is_staff ? styles.bubbleStaff : styles.bubbleClient,
                          ]}
                        >
                          <Text
                            style={[
                              styles.bubbleLabel,
                              msg.is_staff ? styles.bubbleLabelStaff : styles.bubbleLabelClient,
                            ]}
                          >
                            {msg.is_staff ? '🏛️ YOU (STAFF ARCHITECT)' : `👤 ${msg.sender_name || 'CLIENT'}`}
                          </Text>
                          <Text style={styles.bubbleText}>{msg.message}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>

                {/* Staff Message Composer */}
                <View style={styles.chatComposer}>
                  <TextInput
                    style={styles.chatInput}
                    value={chatInput}
                    onChangeText={setChatInput}
                    placeholder="Type official staff response to client..."
                    placeholderTextColor="#666"
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.sendBtn, isSendingMessage && { opacity: 0.5 }]}
                    onPress={sendStaffMessage}
                    disabled={isSendingMessage}
                  >
                    <Text style={styles.sendBtnText}>{isSendingMessage ? '...' : 'TRANSMIT ↵'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════
            TAB 4: CLIENT REVIEW MODERATION
            ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'reviews' && (
          <View>
            <View style={styles.filterRow}>
              {['all', 'pending', 'approved'].map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, reviewFilter === f && styles.filterChipActive]}
                  onPress={() => setReviewFilter(f)}
                >
                  <Text style={[styles.filterChipText, reviewFilter === f && styles.filterChipTextActive]}>
                    {f.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.refreshBtn} onPress={fetchReviews}>
                <Text style={styles.refreshBtnText}>🔄</Text>
              </TouchableOpacity>
            </View>

            {isLoadingReviews ? (
              <ActivityIndicator color="#d4af37" style={{ marginTop: 20 }} />
            ) : reviews.filter((r) =>
                reviewFilter === 'all'
                  ? true
                  : reviewFilter === 'pending'
                  ? !r.is_approved
                  : r.is_approved
              ).length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>No reviews match this filter.</Text>
              </View>
            ) : (
              reviews
                .filter((r) =>
                  reviewFilter === 'all'
                    ? true
                    : reviewFilter === 'pending'
                    ? !r.is_approved
                    : r.is_approved
                )
                .map((rev) => (
                  <View key={rev.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reviewerName}>{rev.client_name}</Text>
                        <Text style={styles.reviewerCompany}>
                          {rev.company} • {rev.role}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          rev.is_approved ? styles.statusBadgeClosed : styles.statusBadgeNew,
                        ]}
                      >
                        <Text style={styles.statusBadgeText}>
                          {rev.is_approved ? 'APPROVED' : 'PENDING'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.reviewStars}>{'★'.repeat(rev.rating)}</Text>
                    <Text style={styles.reviewBody}>"{rev.review_text}"</Text>

                    <TouchableOpacity
                      style={[
                        styles.approveBtn,
                        rev.is_approved ? styles.approveBtnUnapprove : styles.approveBtnApprove,
                      ]}
                      onPress={() => toggleReviewApproval(rev.id)}
                    >
                      <Text style={styles.approveBtnText}>
                        {rev.is_approved ? '❌ REVOKE APPROVAL' : '✅ APPROVE & PUBLISH TO WEBSITE'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
            )}
          </View>
        )}
      </ScrollView>

      {/* ═══════════════════════════════════════════════════════════
          MODAL: API HOST CONFIGURATION
          ═══════════════════════════════════════════════════════════ */}
      <Modal visible={showHostModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>BACKEND SERVER ENDPOINT</Text>
              <TouchableOpacity onPress={() => setShowHostModal(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.presetBtn,
                apiHost === 'https://empirecodes-backend-drf.onrender.com' && styles.presetBtnActive,
              ]}
              onPress={() => {
                setApiHost('https://empirecodes-backend-drf.onrender.com');
                setCustomHost('https://empirecodes-backend-drf.onrender.com');
              }}
            >
              <Text style={styles.presetTitle}>☁️ Render Cloud</Text>
              <Text style={styles.presetSub}>https://empirecodes-backend-drf.onrender.com</Text>
            </TouchableOpacity>


            <TouchableOpacity
              style={[
                styles.presetBtn,
                apiHost === 'http://192.168.100.13:8000' && styles.presetBtnActive,
              ]}
              onPress={() => {
                setApiHost('http://192.168.100.13:8000');
                setCustomHost('http://192.168.100.13:8000');
              }}
            >
              <Text style={styles.presetTitle}>💻 Local Laptop</Text>
              <Text style={styles.presetSub}>http://192.168.100.13:8000</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.customHostInput}
              value={customHost}
              onChangeText={setCustomHost}
              placeholder="Custom host..."
              placeholderTextColor="#666"
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={styles.saveHostBtn}
              onPress={() => {
                setApiHost(customHost.trim());
                setShowHostModal(false);
                checkServerHealth();
              }}
            >
              <Text style={styles.saveHostBtnText}>SAVE & RECONNECT 🌐</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLESHEET (Dark Architect Staff Palette)
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020202',
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#020202',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  authCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#080808',
    borderWidth: 1,
    borderColor: '#d4af37',
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
  },
  authEmblem: {
    fontSize: 40,
    marginBottom: 8,
  },
  authTitle: {
    color: '#d4af37',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 4,
  },
  authSub: {
    color: '#888',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 20,
  },
  authInputBox: {
    width: '100%',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 4,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  authTextInput: {
    color: '#3dff8b',
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 10,
    textAlign: 'center',
    letterSpacing: 4,
  },
  authSubmitBtn: {
    width: '100%',
    backgroundColor: '#3dff8b',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  authSubmitBtnText: {
    color: '#020202',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: '#050505',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    color: '#d4af37',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  pulseGreen: {
    backgroundColor: '#3dff8b',
  },
  pulseRed: {
    backgroundColor: '#ff4444',
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 9,
    fontFamily: 'monospace',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  hostBtn: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
  },
  hostBtnText: {
    color: '#d4af37',
    fontSize: 9,
    fontWeight: '800',
  },
  lockBtn: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
  },
  lockBtnText: {
    fontSize: 10,
  },
  vitalsStrip: {
    flexDirection: 'row',
    backgroundColor: '#080808',
    borderBottomWidth: 1,
    borderBottomColor: '#181818',
    paddingVertical: 8,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  vitalBox: {
    alignItems: 'center',
  },
  vitalLabel: {
    color: '#666',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  vitalVal: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0c0c0c',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#d4af37',
    backgroundColor: 'rgba(212, 175, 55, 0.05)',
  },
  tabText: {
    color: '#777',
    fontSize: 10,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#d4af37',
  },
  contentArea: {
    padding: 14,
    paddingBottom: 40,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    marginBottom: 12,
  },
  filterChip: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#262626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
  },
  filterChipActive: {
    borderColor: '#3dff8b',
    backgroundColor: 'rgba(61, 255, 139, 0.1)',
  },
  filterChipText: {
    color: '#777',
    fontSize: 9,
    fontWeight: '800',
  },
  filterChipTextActive: {
    color: '#3dff8b',
  },
  refreshBtn: {
    padding: 4,
    marginLeft: 'auto',
  },
  refreshBtnText: {
    fontSize: 14,
  },
  emptyCard: {
    backgroundColor: '#080808',
    borderWidth: 1,
    borderColor: '#1a1a1a',
    padding: 20,
    borderRadius: 4,
    alignItems: 'center',
  },
  emptyCardText: {
    color: '#888',
    fontSize: 12,
  },
  emptyCardSub: {
    color: '#555',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  leadCard: {
    backgroundColor: '#070707',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  leadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  leadName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  leadEmail: {
    color: '#d4af37',
    fontSize: 11,
    marginTop: 1,
  },
  leadPhone: {
    color: '#3dff8b',
    fontSize: 10,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  statusBadgeNew: {
    backgroundColor: 'rgba(255, 170, 0, 0.15)',
    borderColor: '#ffaa00',
    borderWidth: 1,
  },
  statusBadgeProgress: {
    backgroundColor: 'rgba(0, 220, 255, 0.15)',
    borderColor: '#00dcff',
    borderWidth: 1,
  },
  statusBadgeClosed: {
    backgroundColor: 'rgba(61, 255, 139, 0.15)',
    borderColor: '#3dff8b',
    borderWidth: 1,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '900',
  },
  leadService: {
    color: '#aaa',
    fontSize: 11,
    marginBottom: 4,
  },
  leadMessage: {
    color: '#bbb',
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
    backgroundColor: '#0c0c0c',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  dispatchRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  whatsappDispatchBtn: {
    flex: 2,
    backgroundColor: '#3dff8b',
    paddingVertical: 6,
    borderRadius: 3,
    alignItems: 'center',
  },
  whatsappDispatchBtnText: {
    color: '#020202',
    fontSize: 9,
    fontWeight: '900',
  },
  callDispatchBtn: {
    flex: 1,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    paddingVertical: 6,
    borderRadius: 3,
    alignItems: 'center',
  },
  callDispatchBtnText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  emailDispatchBtn: {
    flex: 1,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    paddingVertical: 6,
    borderRadius: 3,
    alignItems: 'center',
  },
  emailDispatchBtnText: {
    color: '#d4af37',
    fontSize: 9,
    fontWeight: '800',
  },
  statusChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: '#181818',
    paddingTop: 6,
  },
  statusChangeLabel: {
    color: '#666',
    fontSize: 9,
    marginRight: 4,
  },
  statusMiniBtn: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#262626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  statusMiniBtnActive: {
    borderColor: '#d4af37',
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
  },
  statusMiniBtnText: {
    color: '#888',
    fontSize: 8,
    fontWeight: '700',
  },
  statusMiniBtnTextActive: {
    color: '#fff',
  },
  orderCard: {
    backgroundColor: '#070707',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  orderIdBadge: {
    color: '#d4af37',
    fontSize: 9,
    fontWeight: '900',
    fontFamily: 'monospace',
  },
  orderTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 1,
  },
  orderClient: {
    color: '#aaa',
    fontSize: 10,
    marginTop: 2,
  },
  orderPhone: {
    color: '#3dff8b',
    fontSize: 10,
  },
  orderStatusPill: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#d4af37',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
  orderStatusPillText: {
    color: '#d4af37',
    fontSize: 9,
    fontWeight: '800',
  },
  orderMetaRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 4,
  },
  orderMeta: {
    color: '#777',
    fontSize: 10,
  },
  orderScope: {
    color: '#bbb',
    fontSize: 11,
    lineHeight: 16,
    backgroundColor: '#0c0c0c',
    padding: 8,
    borderRadius: 4,
    marginVertical: 6,
  },
  orderActionRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  chatActionBtn: {
    flex: 2,
    backgroundColor: '#d4af37',
    paddingVertical: 8,
    borderRadius: 3,
    alignItems: 'center',
  },
  chatActionBtnText: {
    color: '#020202',
    fontSize: 9,
    fontWeight: '900',
  },
  waContractBtn: {
    flex: 1,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#3dff8b',
    paddingVertical: 8,
    borderRadius: 3,
    alignItems: 'center',
  },
  waContractBtnText: {
    color: '#3dff8b',
    fontSize: 9,
    fontWeight: '800',
  },
  chatConsoleContainer: {
    backgroundColor: '#070707',
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 6,
    padding: 10,
  },
  chatConsoleBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    paddingBottom: 8,
    marginBottom: 8,
  },
  chatConsoleOrderTitle: {
    color: '#d4af37',
    fontSize: 11,
    fontWeight: '900',
  },
  chatConsoleClientSub: {
    color: '#888',
    fontSize: 9,
    marginTop: 2,
  },
  chatRefreshBtn: {
    padding: 4,
  },
  chatRefreshBtnText: {
    color: '#aaa',
    fontSize: 9,
  },
  chatFeed: {
    height: 320,
    marginBottom: 10,
  },
  noChatText: {
    color: '#666',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 40,
  },
  chatBubbleRow: {
    marginBottom: 8,
    flexDirection: 'row',
  },
  bubbleRowStaff: {
    justifyContent: 'flex-end',
  },
  bubbleRowClient: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    padding: 8,
    borderRadius: 6,
  },
  bubbleStaff: {
    backgroundColor: '#102015',
    borderWidth: 1,
    borderColor: '#2e7d4d',
    borderBottomRightRadius: 1,
  },
  bubbleClient: {
    backgroundColor: '#1f1b0a',
    borderWidth: 1,
    borderColor: '#d4af37',
    borderBottomLeftRadius: 1,
  },
  bubbleLabel: {
    fontSize: 8,
    fontWeight: '900',
    marginBottom: 2,
  },
  bubbleLabelStaff: {
    color: '#3dff8b',
  },
  bubbleLabelClient: {
    color: '#ffd700',
  },
  bubbleText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 16,
  },
  chatComposer: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  chatInput: {
    flex: 1,
    color: '#fff',
    fontSize: 11,
    maxHeight: 60,
    paddingVertical: 4,
  },
  sendBtn: {
    backgroundColor: '#3dff8b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 3,
    marginLeft: 6,
  },
  sendBtnText: {
    color: '#020202',
    fontSize: 9,
    fontWeight: '900',
  },
  reviewCard: {
    backgroundColor: '#070707',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  reviewerName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  reviewerCompany: {
    color: '#888',
    fontSize: 10,
    marginTop: 1,
  },
  reviewStars: {
    color: '#d4af37',
    fontSize: 12,
    marginBottom: 4,
  },
  reviewBody: {
    color: '#bbb',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  approveBtn: {
    paddingVertical: 8,
    borderRadius: 4,
    alignItems: 'center',
  },
  approveBtnApprove: {
    backgroundColor: '#3dff8b',
  },
  approveBtnUnapprove: {
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  approveBtnText: {
    color: '#020202',
    fontSize: 10,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#d4af37',
    borderRadius: 6,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#d4af37',
    fontSize: 12,
    fontWeight: '900',
  },
  modalCloseText: {
    color: '#ff4444',
    fontSize: 14,
    fontWeight: '900',
  },
  presetBtn: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#262626',
    padding: 10,
    borderRadius: 4,
    marginBottom: 8,
  },
  presetBtnActive: {
    borderColor: '#3dff8b',
  },
  presetTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  presetSub: {
    color: '#777',
    fontSize: 10,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  customHostInput: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    color: '#fff',
    borderRadius: 4,
    padding: 8,
    fontSize: 11,
    marginVertical: 10,
  },
  saveHostBtn: {
    backgroundColor: '#3dff8b',
    paddingVertical: 10,
    borderRadius: 4,
    alignItems: 'center',
  },
  saveHostBtnText: {
    color: '#020202',
    fontSize: 11,
    fontWeight: '900',
  },
});

