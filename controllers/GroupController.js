const { getRandomGroup } = require('../services/PgGroupService');

class GroupController {
    async getRandomGroup(req, res) {
        try {
            res.set('Cache-Control', 'no-store');
            const group = await getRandomGroup();
            if (group) {
                res.json({ status: 'success', data: group });
            } else {
                res.status(404).json({ status: 'error', message: '未找到任何group数据' });
            }
        } catch (error) {
            res.status(500).json({ status: 'error', message: '服务器内部错误', error: error.message });
        }
    }
}

module.exports = new GroupController(); 