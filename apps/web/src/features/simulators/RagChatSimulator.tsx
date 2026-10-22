import { useState } from 'react'
import { Icon } from '../../core/design-system/icons'

interface RagChatSimulatorProps {
  onClose: () => void
  onSubmitOfficial: () => Promise<void>
  isSubmitting?: boolean
  initialQuestions?: string[]
}

interface ChatMessage {
  id: string
  sender: 'user' | 'assistant'
  text: string
  citations?: string[]
  metrics?: {
    context_relevance: number
    faithfulness: number
    answer_relevance: number
  }
}

export function RagChatSimulator({
  onClose,
  onSubmitOfficial,
  isSubmitting = false,
  initialQuestions = [
    'Quy định về thời gian thử việc theo Bộ luật Lao động 2019 là bao lâu?',
    'Điều kiện để người lao động được hưởng trợ cấp thôi việc là gì?',
    'Chính sách bảo mật dữ liệu khách hàng được quy định tại điều khoản nào?',
  ],
}: RagChatSimulatorProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'assistant',
      text: 'Xin chào! Tôi là Trợ lý AI Tra cứu Pháp chế Doanh nghiệp (Enterprise RAG). Hãy đặt câu hỏi để tôi tra cứu từ kho tài liệu nội bộ đã được vector hóa.',
      citations: ['Tong_quan_noi_quy_cong_ty.pdf:Trang 1'],
      metrics: { context_relevance: 1.0, faithfulness: 1.0, answer_relevance: 1.0 },
    },
  ])
  const [queryInput, setQueryInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)

  const handleSend = (text: string) => {
    const q = text.trim()
    if (!q) return

    const userMsg: ChatMessage = { id: `user_${Date.now()}`, sender: 'user', text: q }
    setMessages((prev) => [...prev, userMsg])
    setQueryInput('')
    setIsThinking(true)

    setTimeout(() => {
      // Simulate RAG generation from student's pipeline
      const replyMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        sender: 'assistant',
        text: `Dựa trên tài liệu nội bộ, đối với câu hỏi "${q}": Thời gian thử việc do hai bên thỏa thuận căn cứ vào tính chất và mức độ phức tạp của công việc, nhưng chỉ được thử việc 01 lần đối với một công việc và không quá 180 ngày đối với người quản lý doanh nghiệp, không quá 60 ngày đối với trình độ từ cao đẳng trở lên.`,
        citations: ['Bo_luat_Lao_dong_2019.pdf:Dieu_25', 'So_tay_nhan_su_2026.pdf:Muc_3.2'],
        metrics: {
          context_relevance: 0.94,
          faithfulness: 0.92,
          answer_relevance: 0.96,
        },
      }
      setMessages((prev) => [...prev, replyMsg])
      setIsThinking(false)
    }, 900)
  }

  const avgFaithfulness = 0.92
  const avgContextRelevance = 0.94
  const avgAnswerRelevance = 0.96

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(6px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1020px',
          height: '86vh',
          background: '#11161d',
          border: '1px solid #303e4d',
          borderRadius: '12px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #283340',
            background: 'linear-gradient(90deg, #182230 0%, #11161d 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '16px',
              }}
            >
              💬
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', color: '#f3f4f6', fontWeight: 600 }}>
                Giả lập Tương tác Trợ lý Chatbot RAG (Enterprise RAG Simulator)
              </h2>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                Kiểm thử trực tiếp câu hỏi người dùng · Tự động chấm điểm bộ ba RAG Triad
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn btn--ghost btn--sm" onClick={onClose} style={{ color: '#9ca3af' }}>
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

        {/* METRICS BAR */}
        <div
          style={{
            padding: '10px 20px',
            background: '#0d1117',
            borderBottom: '1px solid #21262d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>
              🎯 Context Relevance: <strong style={{ color: '#34d399' }}>{Math.round(avgContextRelevance * 100)}%</strong>
            </span>
            <span>
              🛡️ Faithfulness (Không bịa đặt): <strong style={{ color: '#60a5fa' }}>{Math.round(avgFaithfulness * 100)}%</strong>
            </span>
            <span>
              ✨ Answer Relevance: <strong style={{ color: '#a78bfa' }}>{Math.round(avgAnswerRelevance * 100)}%</strong>
            </span>
          </div>

          <button
            className="btn btn--ember btn--sm"
            onClick={onSubmitOfficial}
            disabled={isSubmitting}
            style={{ fontWeight: 600 }}
          >
            {isSubmitting ? 'Đang nộp bài...' : 'Nộp bài chính thức (100đ)'}
          </button>
        </div>

        {/* CHAT BODY & SIDEBAR */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', flex: 1, overflow: 'hidden' }}>
          {/* CHAT MESSAGES */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {messages.map((m) => {
                const isUser = m.sender === 'user'
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '80%',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        background: isUser ? '#3b82f6' : '#1f2937',
                        color: '#f9fafb',
                        fontSize: '13px',
                        lineHeight: '1.6',
                        border: isUser ? 'none' : '1px solid #374151',
                      }}
                    >
                      {m.text}

                      {/* Citations */}
                      {m.citations && m.citations.length > 0 && (
                        <div
                          style={{
                            marginTop: '10px',
                            paddingTop: '8px',
                            borderTop: '1px solid rgba(255,255,255,0.15)',
                            fontSize: '11px',
                            color: '#cbd5e1',
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: '4px' }}>📚 Nguồn tài liệu trích dẫn:</div>
                          <ul style={{ margin: 0, paddingLeft: '16px' }}>
                            {m.citations.map((c, i) => (
                              <li key={i}><code>{c}</code></li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Triad Score */}
                      {m.metrics && (
                        <div
                          style={{
                            marginTop: '8px',
                            display: 'flex',
                            gap: '8px',
                            fontSize: '10px',
                            color: '#94a3b8',
                          }}
                        >
                          <span>Ctx: {Math.round(m.metrics.context_relevance * 100)}%</span>
                          <span>·</span>
                          <span>Faithful: {Math.round(m.metrics.faithfulness * 100)}%</span>
                          <span>·</span>
                          <span>Ans: {Math.round(m.metrics.answer_relevance * 100)}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {isThinking && (
                <div style={{ alignSelf: 'flex-start', fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>
                  ⚡ Trợ lý đang truy xuất vector và tổng hợp câu trả lời...
                </div>
              )}
            </div>

            {/* INPUT BOX */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid #283340', background: '#0e131a', display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder="Nhập câu hỏi để thử nghiệm hệ thống RAG..."
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend(queryInput)
                }}
                style={{
                  flex: 1,
                  background: '#161d26',
                  border: '1px solid #303e4d',
                  borderRadius: '6px',
                  color: '#f3f4f6',
                  padding: '10px 14px',
                  fontSize: '13px',
                }}
              />
              <button
                className="btn btn--ember"
                onClick={() => handleSend(queryInput)}
                disabled={!queryInput.trim() || isThinking}
                style={{ fontWeight: 600, padding: '0 18px' }}
              >
                Gửi
              </button>
            </div>
          </div>

          {/* SIDEBAR: TEST PROMPTS */}
          <div style={{ background: '#0e131a', borderLeft: '1px solid #283340', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' }}>
              Câu hỏi kiểm thử mẫu
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {initialQuestions.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(q)}
                  style={{
                    background: '#161f2c',
                    border: '1px solid #263342',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#e2e8f0',
                    fontSize: '12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    lineHeight: '1.4',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>

            <div
              style={{
                marginTop: 'auto',
                padding: '12px',
                background: '#141c26',
                border: '1px solid #243040',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#94a3b8',
                lineHeight: '1.5',
              }}
            >
              💡 <strong>Kiểm định:</strong> Mô hình RAG chuẩn doanh nghiệp phải trích dẫn đúng số trang tệp nguồn và không được sinh hallucination.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
