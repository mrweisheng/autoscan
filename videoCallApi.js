// 检查视频通话状态
const accountPhone = "12345678901";
const recipientPhone = "12345678902";
http.get(`http://104.37.187.30:9000/conversations/video-call-status?accountPhone=${accountPhone}&recipientPhone=${recipientPhone}`, {}, function(res, err) {
    if (err) {
        console.error(err);
        return;
    }
    
    try {
        const result = JSON.parse(res.body.string());
        
        if (result.status === "success") {
            console.log("视频通话状态检查 is ok");
            
            if (result.canCall) {
                console.log("可以发起视频通话");
            } else if (result.reason === "conversation_not_found") {
                console.log("会话不存在");
            } else {
                console.log("已存在视频通话，无法再次发起");
            }
        } else {
            console.log("视频通话状态检查失败:", result.message);
        }
    } catch (e) {
        console.error("解析响应失败:", e);
    }
});

// 完成视频通话处理
const conversationKey = "12345678901_12345678902";
http.get(`http://104.37.187.30:9000/conversations/video-call-complete?conversationKey=${conversationKey}`, {}, function(res, err) {
    if (err) {
        console.error(err);
        return;
    }
    
    try {
        const result = JSON.parse(res.body.string());
        
        if (result.status === "success") {
            console.log("视频通话完成处理 is ok");
            console.log("消息:", result.message);
            
            if (result.webhookResponse) {
                console.log("Webhook响应:", JSON.stringify(result.webhookResponse));
            }
        } else {
            console.log("视频通话完成处理失败:", result.message);
            
            // 根据错误类型打印不同信息
            if (result.error === "conversation_not_found") {
                console.log("原因: 指定的会话不存在");
            } else if (result.error === "call_already_active") {
                console.log("原因: 已存在视频通话记录");
            } else if (result.error === "webhook_failed") {
                console.log("原因: Webhook通知失败");
            }
        }
    } catch (e) {
        console.error("解析响应失败:", e);
    }
});

// 获取所有已完成视频通话的会话记录
console.log("\n[开始] 获取视频通话记录");
http.get(`http://104.37.187.30:9000/conversations/video-calls`, {}, function(res, err) {
    if (err) {
        console.error("[错误] 请求失败:", err);
        return;
    }
    
    try {
        const result = JSON.parse(res.body.string());
        
        if (result.status === "success") {
            console.log("[成功] 获取视频通话记录 is ok");
            console.log(`[统计] 总共找到 ${result.count} 条记录`);
            
            if (result.data && result.data.length > 0) {
                console.log("[数据] 前5条记录:");
                // 只显示前5条记录，避免输出过多
                const displayCount = Math.min(result.data.length, 5);
                for (let i = 0; i < displayCount; i++) {
                    const record = result.data[i];
                    console.log(`  ${i+1}. 会话键: ${record.conversationKey}, 更新时间: ${record.updatedAt}`);
                }
                
                // 如果记录很多，提示有更多
                if (result.data.length > 5) {
                    console.log(`  ... 还有 ${result.data.length - 5} 条记录`);
                }
            } else {
                console.log("[提示] 没有找到视频通话记录");
            }
        } else {
            console.log("[失败] 获取视频通话记录失败:", result.message);
        }
    } catch (e) {
        console.error("[错误] 解析响应失败:", e);
    }
});

// 重置指定的视频通话记录
console.log("\n[开始] 重置视频通话记录");
const resetConversationKey = "12345678901_12345678902";
http.get(`http://104.37.187.30:9000/conversations/reset-video-call?conversationKey=${resetConversationKey}`, {}, function(res, err) {
    if (err) {
        console.error("[错误] 请求失败:", err);
        return;
    }
    
    try {
        const result = JSON.parse(res.body.string());
        
        if (result.status === "success") {
            console.log("[成功] 重置视频通话记录 is ok");
            console.log("[消息]", result.message);
            console.log("[数据] 会话键:", result.data.conversationKey);
        } else {
            console.log("[失败] 重置视频通话记录失败:", result.message);
            
            // 根据错误类型打印不同信息
            if (result.error === "conversation_not_found") {
                console.log("[原因] 指定的会话不存在");
            } else if (result.error === "call_not_active") {
                console.log("[原因] 该会话没有活跃的视频通话记录");
            } else if (result.error === "update_failed") {
                console.log("[原因] 更新记录失败");
            }
        }
    } catch (e) {
        console.error("[错误] 解析响应失败:", e);
    }
});

// 使用回调函数获取异步结果的例子
function hello(aaa, bbb, callback) {
    const accountPhone = aaa;
    const recipientPhone = bbb;
    http.get(`http://104.37.187.30:9000/conversations/video-call-status?accountPhone=${accountPhone}&recipientPhone=${recipientPhone}`, {}, function(res, err) {
        if (err) {
            console.error(err);
            callback(null);
            return;
        }
        
        try {
            const result = JSON.parse(res.body.string());
            
            if (result.status === "success") {
                console.log("视频通话状态检查 is ok");
                
                if (result.canCall) {
                    console.log("可以发起视频通话");
                    callback("接听");
                } else if (result.reason === "conversation_not_found") {
                    console.log("会话不存在");
                    callback("会话不存在");
                } else {
                    console.log("已存在视频通话，无法再次发起");
                    callback("已存在通话");
                }
            } else {
                console.log("视频通话状态检查失败:", result.message);
                callback("检查失败");
            }
        } catch (e) {
            console.error("解析响应失败:", e);
            callback("解析失败");
        }
    });
}

// 调用示例
hello("85257892702", "639955400741", function(result) {
    console.log("获取到的结果是:", result);
    // 在这里可以根据result做后续处理
    if (result === "接听") {
        console.log("可以进行视频通话");
        // 这里可以继续执行其他操作
    }
});

