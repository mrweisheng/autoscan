// 检查视频通话状态
http.get("http://104.37.187.30:9000/conversations/video-call-status?accountPhone=12345678901&recipientPhone=12345678902", {}, function(res, err) {
    if (err) {
        console.error(err);
        return;
    }
    console.log(res.body.string());
});
http.get("ttp://104.37.187.30:9000/conversations/video-call-complete?conversationKey=12345678901_12345678902", {}, function(res, err) {
    if (err) {
        console.error(err);
        return;
    }
    console.log(res.body.string());
});
