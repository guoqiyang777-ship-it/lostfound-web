<template>
  <div class="chat-container">
    <h2 class="page-title">消息中心</h2>
    
    <el-card class="chat-card">
      <div class="chat-layout">
        <!-- 联系人列表 -->
        <div class="contact-list">
          <div class="contact-header">
            <h3>联系人列表</h3>
          </div>
          <div class="contact-body">
            <div 
              v-for="user in chatUsers" 
              :key="user.userId" 
              class="contact-item"
              :class="{ 'active': currentChatUser && currentChatUser.userId === user.userId }"
              @click="selectChatUser(user)"
            >
              <el-avatar :size="40" :src="user.avatarUrl || defaultAvatar"></el-avatar>
              <div class="contact-info">
                <div class="contact-name">{{ user.realName }}</div>
                <div class="contact-last-message" v-if="user.lastMessage">{{ user.lastMessage }}</div>
                <div class="contact-username" v-else>{{ user.username }}</div>
              </div>
              <div class="unread-badge" v-if="user.unreadCount && user.unreadCount > 0">{{ user.unreadCount }}</div>
            </div>
            <div v-if="chatUsers.length === 0" class="no-contact">
              暂无聊天记录
            </div>
          </div>
        </div>
        
        <!-- 聊天区域 -->
        <div class="chat-area">
          <template v-if="currentChatUser">
            <div class="chat-header">
              <h3>{{ currentChatUser.realName }}</h3>
              <el-button type="danger" size="small" @click="handleDeleteContact">删除联系人</el-button>
            </div>
            <div class="chat-messages" ref="chatMessagesRef">
              <div v-if="chatMessages.length === 0" class="no-message">
                暂无消息记录，开始聊天吧
              </div>
              <div 
                v-for="(message, index) in chatMessages" 
                :key="index" 
                class="message-item"
                :class="{ 'self': message.fromUser === userId }"
              >
                <el-avatar 
                  :size="36" 
                  :src="message.fromUser === userId ? (userInfo.avatarUrl || defaultAvatar) : (currentChatUser.avatarUrl || defaultAvatar)"
                ></el-avatar>
                <div class="message-content">
                  <div class="message-text">{{ message.content }}</div>
                  <div class="message-time">{{ formatDateTime(message.createTime) }}</div>
                </div>
              </div>
            </div>
            <div class="chat-input">
              <el-input
                v-model="messageContent"
                type="textarea"
                :rows="3"
                placeholder="请输入消息内容"
                @keyup.enter.native="sendMessage"
              />
              <el-button type="primary" :loading="sending" @click="sendMessage">发送</el-button>
            </div>
          </template>
          <div v-else class="no-chat-selected">
            <el-empty description="请选择联系人开始聊天" />
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getChatUserListWithDetail, getChatHistory, sendMessage as apiSendMessage, markMessageAsRead, deleteContact as apiDeleteContact } from '../../api/chat';
import { getUserInfo, getUserInfoById } from '../../api/user';
import eventBus from '../../utils/eventBus';
import webSocketClient from '../../utils/websocket';
import { formatDateTime } from '../../utils/dateUtils';

const route = useRoute();
const router = useRouter();
const isLoggedIn = computed(() => !!localStorage.getItem('token'));
const chatUsers = ref([]);
const chatMessages = ref([]);
const currentChatUser = ref(null);
const messageContent = ref('');
const sending = ref(false);
const chatMessagesRef = ref(null);
const userId = ref(null);
const userInfo = ref({});
const defaultAvatar = 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png';

// 防抖定时器
let fetchChatUsersTimer = null;
let fetchChatHistoryTimer = null;

// 获取聊天用户列表（带防抖）
const fetchChatUsers = async (immediate = false) => {
  // 如果不是立即执行，使用防抖
  if (!immediate) {
    if (fetchChatUsersTimer) {
      clearTimeout(fetchChatUsersTimer);
    }
    fetchChatUsersTimer = setTimeout(() => {
      fetchChatUsersNow();
    }, 500); // 500ms防抖
    return;
  }
  
  await fetchChatUsersNow();
};

// 实际获取聊天用户列表的函数
const fetchChatUsersNow = async () => {
  try {
    const res = await getChatUserListWithDetail();
    if (res && res.data) {
      chatUsers.value = res.data;
      
      // 如果URL中有userId参数，选择对应的用户
      const urlUserId = route.query.userId;
      if (urlUserId) {
        console.log('URL中包含userId参数:', urlUserId);
        // 确保将urlUserId转换为数字进行比较
        const toUserId = Number(urlUserId);
        console.log('转换后的userId类型:', typeof toUserId, '值:', toUserId);
        
        // 检查toUserId是否为有效数字
        if (isNaN(toUserId)) {
          console.error('URL参数userId转换为数字失败:', urlUserId);
          ElMessage.error('无效的用户ID参数');
          return;
        }
        
        const targetUser = chatUsers.value.find(user => {
          const userIdNum = Number(user.userId);
          console.log('比较用户ID:', userIdNum, '与目标ID:', toUserId, '是否相等:', userIdNum === toUserId);
          return userIdNum === toUserId;
        });
        
        if (targetUser) {
          console.log('找到匹配的用户:', targetUser);
          selectChatUser(targetUser);
        } else {
          console.log('未找到匹配的用户，尝试创建新的聊天');
          // 如果在现有聊天列表中找不到该用户，尝试获取该用户信息并创建新的聊天
          await createNewChat(toUserId);
        }
      }
    } else {
      console.warn('获取聊天用户列表返回数据格式不正确');
      chatUsers.value = [];
    }
  } catch (error) {
    console.error('获取聊天用户列表失败:', error);
    ElMessage.error('获取聊天用户列表失败: ' + (error.message || '未知错误'));
    chatUsers.value = []; // 确保在错误情况下设置为空数组
  }
};

// 创建新的聊天会话
const createNewChat = async (userId) => {
  try {
    // 调用API获取用户详细信息
    const res = await getUserInfoById(userId);
    if (res && res.data) {
      const user = res.data;
      
      // 创建用户对象
      const newUser = {
        userId: user.id,
        username: user.username,
        realName: user.realName || user.username,
        avatarUrl: user.avatarUrl,
        unreadCount: 0
      };
      
      // 将新用户添加到聊天列表的开头
      chatUsers.value.unshift(newUser);
      
      // 选择该用户
      selectChatUser(newUser);
      
      console.log('已创建新的聊天会话:', newUser);
    } else {
      // 如果无法获取用户信息，创建一个临时的用户对象
      const newUser = {
        userId: userId,
        username: '用户' + userId,
        realName: '用户' + userId,
        unreadCount: 0
      };
      
      // 将新用户添加到聊天列表的开头
      chatUsers.value.unshift(newUser);
      
      // 选择该用户
      selectChatUser(newUser);
      
      console.log('已创建临时聊天会话:', newUser);
    }
  } catch (error) {
    console.error('创建新聊天失败:', error);
    ElMessage.error('无法联系该用户');
  }
};

// 获取当前用户信息
const fetchUserInfo = async () => {
  try {
    const res = await getUserInfo();
    userInfo.value = res.data;
    userId.value = res.data.id;
    
    // 获取聊天用户列表
    await fetchChatUsers();
  } catch (error) {
    console.error('获取用户信息失败:', error);
  }
};

// 选择聊天用户
const selectChatUser = async (user) => {
  currentChatUser.value = user;
  await fetchChatHistory(true); // 立即获取聊天记录
  
  // 当用户点击聊天框时，将该用户发送的消息标记为已读
  if (user && user.userId) {
    try {
      // 确保userId是数字类型
      const fromUserId = Number(user.userId);
      console.log('标记消息为已读，fromUserId类型:', typeof fromUserId, '值:', fromUserId);
      
      // 检查fromUserId是否为有效数字
      if (isNaN(fromUserId)) {
        console.error('用户ID转换为数字失败:', user.userId);
        ElMessage.error('无效的用户ID');
        return;
      }
      
      await markMessageAsRead(fromUserId);
      console.log('选择聊天用户后标记消息为已读');
      // 触发事件，通知Layout组件更新未读消息数量
      eventBus.emit('update-unread-count');
      // 刷新聊天用户列表（使用防抖）
      fetchChatUsers(); // 按照规范使用防抖
    } catch (error) {
      console.error('标记消息为已读失败:', error);
      ElMessage.error('标记消息为已读失败: ' + (error.message || '未知错误'));
    }
  }
};

// 获取聊天记录（带防抖）
const fetchChatHistory = async (immediate = false) => {
  if (!currentChatUser.value || !userId.value) return;
  
  // 如果不是立即执行，使用防抖
  if (!immediate) {
    if (fetchChatHistoryTimer) {
      clearTimeout(fetchChatHistoryTimer);
    }
    fetchChatHistoryTimer = setTimeout(() => {
      fetchChatHistoryNow();
    }, 300); // 300ms防抖
    return;
  }
  
  await fetchChatHistoryNow();
};

// 实际获取聊天记录的函数
const fetchChatHistoryNow = async () => {
  if (!currentChatUser.value || !userId.value) return;
  
  try {
    // 确保userId是数字类型
    const chatUserId = Number(currentChatUser.value.userId);
    console.log('获取聊天记录，userId类型:', typeof chatUserId, '值:', chatUserId);
    
    // 检查userId是否为有效数字
    if (isNaN(chatUserId)) {
      console.error('用户ID转换为数字失败:', currentChatUser.value.userId);
      ElMessage.error('无效的用户ID');
      return;
    }
    
    const res = await getChatHistory(chatUserId);
    chatMessages.value = res.data;
    
    // 滚动到底部
    await nextTick();
    scrollToBottom();
    
    // 不再自动标记为已读，改为用户查看后手动标记
    // 或在用户与消息交互后标记
    // 移除自动调用markMessageAsRead的逻辑，改为等待用户交互后标记
  } catch (error) {
    console.error('获取聊天记录失败:', error);
    ElMessage.error('获取聊天记录失败: ' + (error.message || '未知错误'));
  }
};

// 发送消息
const sendMessage = async () => {
  if (!messageContent.value.trim() || !currentChatUser.value) return;
  
  sending.value = true;
  try {
    // 确保toUser是数字类型
    const toUserId = Number(currentChatUser.value.userId);
    console.log('发送消息，toUserId类型:', typeof toUserId, '值:', toUserId);
    
    // 检查toUserId是否为有效数字
    if (isNaN(toUserId)) {
      console.error('用户ID转换为数字失败:', currentChatUser.value.userId);
      ElMessage.error('无效的用户ID');
      return;
    }
    
    await apiSendMessage({
      toUser: toUserId, // 使用toUser作为参数名，与后端ChatDTO中的字段名一致
      content: messageContent.value.trim()
    });
    
    // 清空输入框
    messageContent.value = '';
    
    // 立即重新获取聊天记录
    await fetchChatHistory(true);
    
    // 用户发送消息时，标记当前对话为已读
    await markMessageAsRead(toUserId);
    eventBus.emit('update-unread-count');
    // 刷新聊天用户列表（使用防抖）
    fetchChatUsers(); // 按照规范使用防抖
  } catch (error) {
    console.error('发送消息失败:', error);
    ElMessage.error('发送消息失败: ' + (error.message || '未知错误'));
  } finally {
    sending.value = false;
  }
};

// 删除联系人
const handleDeleteContact = async () => {
  if (!currentChatUser.value) return;
  
  try {
    await ElMessageBox.confirm(
      `确定要删除联系人 ${currentChatUser.value.realName} 吗？删除后该联系人将从列表中移除，但聊天记录会保留。`,
      '删除联系人',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
    
    // 确保contactUserId是数字类型
    const contactUserId = Number(currentChatUser.value.userId);
    console.log('删除联系人，contactUserId类型:', typeof contactUserId, '值:', contactUserId);
    
    // 检查contactUserId是否为有效数字
    if (isNaN(contactUserId)) {
      console.error('联系人ID转换为数字失败:', currentChatUser.value.userId);
      ElMessage.error('无效的联系人ID');
      return;
    }
    
    const res = await apiDeleteContact(contactUserId);
    ElMessage.success('删除联系人成功');
    
    // 重新获取聊天用户列表
    await fetchChatUsers();
    
    // 清空当前聊天用户
    currentChatUser.value = null;
    chatMessages.value = [];
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除联系人失败:', error);
      ElMessage.error('删除联系人失败: ' + (error.message || '未知错误'));
    }
  }
};

// 使用通用的日期时间格式化函数

// 滚动到底部
const scrollToBottom = () => {
  if (chatMessagesRef.value) {
    chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight;
  }
};

// 监听消息变化，自动滚动到底部
watch(chatMessages, () => {
  nextTick(() => {
    scrollToBottom();
  });
});



// 监听新消息事件
const setupEventListeners = () => {
  eventBus.on('new-message', handleNewMessage);
  eventBus.on('read-status-update', handleReadStatusUpdate);
  eventBus.on('contact-deleted', handleContactDeleted);
};

// 清除事件监听
const cleanupEventListeners = () => {
  eventBus.off('new-message', handleNewMessage);
  eventBus.off('read-status-update', handleReadStatusUpdate);
  eventBus.off('contact-deleted', handleContactDeleted);
};

// 处理新消息
const handleNewMessage = (message) => {
  console.log('收到新消息:', message);
  
  // 如果当前正在与发送消息的用户或接收消息的用户聊天，则立即刷新聊天记录
  if (currentChatUser.value && 
      (message.fromUser === currentChatUser.value.userId || message.toUser === currentChatUser.value.userId)) {
    fetchChatHistory(true); // 立即刷新当前聊天记录
  }
  
  // 更新聊天用户列表（使用防抖）
  fetchChatUsers(); // 按照规范使用防抖
};

// 处理已读状态更新
const handleReadStatusUpdate = (data) => {
  console.log('收到已读状态更新:', data);
  // 如果当前正在与相关用户聊天，则刷新聊天记录以更新已读状态
  if (currentChatUser.value && 
      (data.fromUser === currentChatUser.value.userId || data.toUser === currentChatUser.value.userId)) {
    fetchChatHistory(); // 使用防抖刷新聊天记录
  }
  // 刷新聊天用户列表，更新未读消息数量（使用防抖）
  fetchChatUsers();
};

// 处理联系人删除
const handleContactDeleted = (data) => {
  console.log('收到联系人删除通知:', data);
  // 刷新聊天用户列表（使用防抖）
  fetchChatUsers();
  
  // 如果当前正在与被删除的联系人聊天，则清空当前聊天
  if (currentChatUser.value && currentChatUser.value.userId === data.contactUserId) {
    currentChatUser.value = null;
    chatMessages.value = [];
    ElMessage.info('该联系人已被删除');
  }
};



onMounted(async () => {
  if (!isLoggedIn.value) {
    ElMessage.warning('请先登录后再访问消息中心');
    router.push('/user/login');
    return;
  }

  // 先获取用户信息，确保userId已设置
  await fetchUserInfo();
  
  // 设置事件监听
  setupEventListeners();
  
  // 获取聊天用户列表，这将处理URL中的userId参数
  await fetchChatUsers();
  
  // 如果URL中有userId参数但在现有聊天列表中找不到对应用户，可能需要创建新的聊天
  // 可能是首次联系该用户，需要特殊处理
  const urlUserId = route.query.userId;
  if (urlUserId && !currentChatUser.value) {
    console.log('处理首次联系的用户:', urlUserId);
    // 创建一个临时用户对象，用于首次联系
    try {
      // 确保将urlUserId转换为数字类型
      const toUserId = Number(urlUserId);
      console.log('转换后的toUserId类型:', typeof toUserId, '值:', toUserId);
      
      // 检查toUserId是否为有效数字
      if (isNaN(toUserId)) {
        console.error('URL参数userId转换为数字失败:', urlUserId);
        ElMessage.error('无效的用户ID参数');
        return;
      }
      
      // 不再自动发送初始消息
      // 仅记录日志，表示找到了用户ID
      console.log('找到有效的用户ID:', toUserId);
      
      // 重新获取聊天用户列表
      await fetchChatUsers();
      
      // 再次尝试选择用户
      const targetUser = chatUsers.value.find(user => {
        const userIdNum = Number(user.userId);
        console.log('比较用户ID:', userIdNum, '与目标ID:', toUserId, '是否相等:', userIdNum === toUserId);
        return userIdNum === toUserId;
      });
      
      if (targetUser) {
        console.log('找到匹配的用户:', targetUser);
        selectChatUser(targetUser);
      } else {
        console.log('未找到匹配的用户，等待系统创建新的聊天会话');
      }
    } catch (error) {
      console.error('创建新聊天失败:', error);
      ElMessage.error('创建新聊天失败: ' + (error.message || '未知错误'));
    }
  }
  
  // 定时刷新聊天记录（作为备用机制，延长时间间隔）
  const timer = setInterval(() => {
    if (currentChatUser.value) {
      fetchChatHistory(true); // 立即刷新，不使用防抖
    }
    // 定时刷新聊天用户列表，更新未读消息数量和最后一条消息
    fetchChatUsers(true); // 立即刷新，不使用防抖
  }, 60000); // 改为每60秒刷新一次，因为已经有WebSocket实时通知
  
  // 组件卸载时清除定时器
  onUnmounted(() => {
    clearInterval(timer);
    // 清除防抖定时器
    if (fetchChatUsersTimer) clearTimeout(fetchChatUsersTimer);
    if (fetchChatHistoryTimer) clearTimeout(fetchChatHistoryTimer);
  });
});

onUnmounted(() => {
  cleanupEventListeners();
  // 清除防抖定时器
  if (fetchChatUsersTimer) clearTimeout(fetchChatUsersTimer);
  if (fetchChatHistoryTimer) clearTimeout(fetchChatHistoryTimer);
});
</script>

<style scoped>
.chat-container {
  padding: 20px;
}

.page-title {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 24px;
  color: #303133;
}

.chat-card {
  margin-bottom: 20px;
}

.chat-layout {
  display: flex;
  height: 600px;
}

.contact-list {
  width: 250px;
  border-right: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
}

.contact-header {
  padding: 10px;
  border-bottom: 1px solid #ebeef5;
}

.contact-header h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.contact-body {
  flex: 1;
  overflow-y: auto;
}

.contact-item {
  display: flex;
  align-items: center;
  padding: 10px;
  cursor: pointer;
  transition: background-color 0.3s;
  position: relative;
}

.contact-item:hover {
  background-color: #f5f7fa;
}

.contact-item.active {
  background-color: #ecf5ff;
}

.contact-info {
  margin-left: 10px;
  flex: 1;
  overflow: hidden;
}

.contact-name {
  font-size: 14px;
  color: #303133;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-username {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-last-message {
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.unread-badge {
  background-color: #f56c6c;
  color: white;
  border-radius: 50%;
  min-width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  padding: 0 4px;
}

.no-contact {
  padding: 20px;
  text-align: center;
  color: #909399;
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.chat-header {
  padding: 10px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-header h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.chat-messages {
  flex: 1;
  padding: 10px;
  overflow-y: auto;
}

.no-message {
  padding: 20px;
  text-align: center;
  color: #909399;
}

.message-item {
  display: flex;
  margin-bottom: 15px;
}

.message-item.self {
  flex-direction: row-reverse;
}

.message-content {
  max-width: 70%;
  margin: 0 10px;
}

.message-text {
  padding: 10px;
  border-radius: 4px;
  background-color: #f5f7fa;
  word-break: break-all;
}

.message-item.self .message-text {
  background-color: #ecf5ff;
  color: #409EFF;
}

.message-time {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
  text-align: right;
}

.message-item.self .message-time {
  text-align: left;
}

.chat-input {
  padding: 10px;
  border-top: 1px solid #ebeef5;
  display: flex;
  align-items: flex-end;
}

.chat-input .el-input {
  margin-right: 10px;
}

.no-chat-selected {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>