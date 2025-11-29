<template>
  <div class="profile-container">
    <h2 class="page-title">个人中心</h2>
    
    <el-row :gutter="20">
      <!-- 个人信息卡片 -->
      <el-col :span="8">
        <el-card class="profile-card">
          <div class="avatar-container">
            <el-avatar :size="100" :src="userInfo.avatarUrl || defaultAvatar"></el-avatar>
            <el-upload
              class="avatar-uploader"
              action="#"
              :http-request="uploadAvatar"
              :show-file-list="false"
              :before-upload="beforeAvatarUpload">
              <el-button size="small" type="primary">更换头像</el-button>
            </el-upload>
          </div>
          
          <div class="user-info">
            <h3>{{ userInfo.realName }}</h3>
            <p>用户名：{{ userInfo.username }}</p>
            <p>学号：{{ userInfo.studentNo }}</p>
            <p>手机号：{{ userInfo.phone }}</p>
          </div>
        </el-card>
      </el-col>
      
      <!-- 修改信息表单 -->
      <el-col :span="16">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>修改个人信息</span>
            </div>
          </template>
          
          <el-tabs v-model="activeTab">
            <!-- 基本信息 -->
            <el-tab-pane label="基本信息" name="basic">
              <el-form :model="basicForm" :rules="basicRules" ref="basicFormRef" label-width="100px">
                <el-form-item label="姓名" prop="realName">
                  <el-input v-model="basicForm.realName" />
                </el-form-item>
                
                <el-form-item label="学号" prop="studentNo">
                  <el-input v-model="basicForm.studentNo" />
                </el-form-item>
                
                <el-form-item label="手机号" prop="phone">
                  <el-input v-model="basicForm.phone" />
                </el-form-item>
                
                <el-form-item>
                  <el-button type="primary" :loading="basicLoading" @click="updateBasicInfo">保存</el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>
            
            <!-- 修改密码 -->
            <el-tab-pane label="修改密码" name="password">
              <el-form :model="passwordForm" :rules="passwordRules" ref="passwordFormRef" label-width="100px">
                <el-form-item label="原密码" prop="oldPassword">
                  <el-input v-model="passwordForm.oldPassword" type="password" show-password />
                </el-form-item>
                
                <el-form-item label="新密码" prop="newPassword">
                  <el-input v-model="passwordForm.newPassword" type="password" show-password />
                </el-form-item>
                
                <el-form-item label="确认密码" prop="confirmPassword">
                  <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
                </el-form-item>
                
                <el-form-item>
                  <el-button type="primary" :loading="passwordLoading" @click="updatePassword">保存</el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { getUserInfo, updateUserInfo, updateAvatar, updatePassword as apiUpdatePassword } from '../../api/user';

const userInfo = ref({});
const activeTab = ref('basic');
const basicFormRef = ref(null);
const passwordFormRef = ref(null);
const basicLoading = ref(false);
const passwordLoading = ref(false);
const defaultAvatar = 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png';

// 基本信息表单
const basicForm = reactive({
  realName: '',
  studentNo: '',
  phone: ''
});

// 密码表单
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
});

// 基本信息验证规则
const basicRules = {
  realName: [
    { required: true, message: '请输入姓名', trigger: 'blur' }
  ],
  studentNo: [
    { required: true, message: '请输入学号', trigger: 'blur' }
  ],
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码', trigger: 'blur' }
  ]
};

// 密码验证规则
const validatePass = (rule, value, callback) => {
  if (value === '') {
    callback(new Error('请输入密码'));
  } else {
    if (passwordForm.confirmPassword !== '') {
      passwordFormRef.value.validateField('confirmPassword');
    }
    callback();
  }
};

const validatePass2 = (rule, value, callback) => {
  if (value === '') {
    callback(new Error('请再次输入密码'));
  } else if (value !== passwordForm.newPassword) {
    callback(new Error('两次输入密码不一致!'));
  } else {
    callback();
  }
};

const passwordRules = {
  oldPassword: [
    { required: true, message: '请输入原密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, validator: validatePass, trigger: 'blur' },
    { min: 6, message: '密码长度不能小于6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, validator: validatePass2, trigger: 'blur' }
  ]
};

// 获取用户信息
const fetchUserInfo = async () => {
  try {
    const res = await getUserInfo();
    userInfo.value = res.data;
    
    // 填充基本信息表单
    basicForm.realName = res.data.realName;
    basicForm.studentNo = res.data.studentNo;
    basicForm.phone = res.data.phone;
    // 确保头像URL也被正确填充
    basicForm.avatarUrl = res.data.avatarUrl;
  } catch (error) {
    console.error('获取用户信息失败:', error);
  }
};

// 更新基本信息
const updateBasicInfo = () => {
  basicFormRef.value.validate(async (valid) => {
    if (valid) {
      basicLoading.value = true;
      try {
        // 构建更新数据，确保包含所有字段
        const updateData = {
          id: userInfo.value.id,
          realName: basicForm.realName,
          studentNo: basicForm.studentNo,
          phone: basicForm.phone,
          avatarUrl: basicForm.avatarUrl || userInfo.value.avatarUrl
        };
        
        await updateUserInfo(updateData);
        ElMessage.success('保存成功');
        
        // 重新获取用户信息
        await fetchUserInfo();
      } catch (error) {
        console.error('更新失败:', error);
      } finally {
        basicLoading.value = false;
      }
    }
  });
};

// 更新密码
const updatePassword = () => {
  passwordFormRef.value.validate(async (valid) => {
    if (valid) {
      passwordLoading.value = true;
      try {
        await apiUpdatePassword(passwordForm.oldPassword, passwordForm.newPassword);
        ElMessage.success('密码修改成功');
        
        // 清空表单
        passwordForm.oldPassword = '';
        passwordForm.newPassword = '';
        passwordForm.confirmPassword = '';
      } catch (error) {
        console.error('修改密码失败:', error);
      } finally {
        passwordLoading.value = false;
      }
    }
  });
};

// 上传头像前的验证
const beforeAvatarUpload = (file) => {
  const isJPG = file.type === 'image/jpeg' || file.type === 'image/png';
  const isLt2M = file.size / 1024 / 1024 < 2;

  if (!isJPG) {
    ElMessage.error('上传头像图片只能是 JPG 或 PNG 格式!');
  }
  if (!isLt2M) {
    ElMessage.error('上传头像图片大小不能超过 2MB!');
  }
  return isJPG && isLt2M;
};

// 上传头像
const uploadAvatar = async (options) => {
  try {
    const res = await updateAvatar(options.file);
    userInfo.value.avatarUrl = res.data;
    // 同时更新表单中的头像URL，确保后续保存不会覆盖
    basicForm.avatarUrl = res.data;
    ElMessage.success('头像上传成功');
  } catch (error) {
    console.error('上传失败:', error);
    ElMessage.error('上传失败');
  }
};

onMounted(() => {
  fetchUserInfo();
});
</script>

<style scoped>
.profile-container {
  padding: 20px;
}

.page-title {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 24px;
  color: #303133;
}

.profile-card {
  text-align: center;
  padding: 20px;
}

.avatar-container {
  margin-bottom: 20px;
}

.avatar-uploader {
  margin-top: 10px;
}

.user-info {
  text-align: left;
}

.user-info h3 {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 18px;
  color: #303133;
}

.user-info p {
  margin: 5px 0;
  color: #606266;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>