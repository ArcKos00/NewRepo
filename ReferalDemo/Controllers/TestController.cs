using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Caching.Memory;
using Newtonsoft.Json;
using ReferalDemo.Models;
using ReferalDemo.ViewModels;
using System.Text;

namespace ReferalDemo.Controllers
{
    public class TestController(IMemoryCache memoryCache) : Controller
    {
        [HttpGet("referal/entry")]
        public async Task<IActionResult> GetEntryPage()
        {
            return View(new BaseModel());
        }

        [HttpPost("referal/send-otp")]
        public async Task<IActionResult> GetConfirmPage([FromForm] BaseModel model)
        {
            var phone = model.GetPhone();
            var modelWithCode = new BaseWithCodeViewModel(model);

            if (memoryCache.TryGetValue(phone, out _))
                return await HandleReferal(modelWithCode);

            memoryCache.Set(phone, string.Empty, TimeSpan.FromMinutes(5));
            // send otp
            return View(modelWithCode);
        }

        [HttpPost("referal/confirm-otp")]
        public async Task<IActionResult> ConfirmOtp([FromForm] BaseWithCodeViewModel viewModel)
        {
            if (viewModel.Code.Length > 2)
                return await HandleReferal(viewModel);

            return View("Error", new ErrorViewModel
            {
                RequestId = Guid.NewGuid().ToString("N"),
            });
        }

        public async Task<IActionResult> HandleReferal(BaseWithCodeViewModel viewModel)
        {
            var data = new Data()
            {
                Phone = viewModel.GetPhone(),
                UserId = viewModel.UserId,
                RequestId = Guid.NewGuid()
            };
            var url = Url.Action("FinalPage", "Test", new
            {
                data = Base64UrlTextEncoder
                .Encode(
                    Encoding.UTF8.GetBytes(
                        JsonConvert.SerializeObject(data)))
            }, Request.Scheme);
            return View("ReferalPage", new ReferalViewModel()
            {
                Phone = viewModel.GetPhone(),
                UserId = viewModel.UserId,
                Url = url
            });
        }

        [HttpGet]
        public async Task<IActionResult> FinalPage([FromQuery] string data)
        {
            var bytes = Base64UrlTextEncoder.Decode(data);
            var jsonData = Encoding.UTF8.GetString(bytes);
            var deserializedData = JsonConvert.DeserializeObject<Data>(jsonData);
            return View(new FinalViewModel()
            {
                Phone = deserializedData.Phone,
                UserId = deserializedData.UserId,
                RequestId = deserializedData.RequestId
            });
        }
    }
}
