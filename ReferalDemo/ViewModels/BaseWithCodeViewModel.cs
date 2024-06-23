namespace ReferalDemo.ViewModels
{
    public class BaseWithCodeViewModel : BaseModel
    {
        public string Code { get; set; }

        public BaseWithCodeViewModel()
        {
        }

        public BaseWithCodeViewModel(BaseModel model)
        {
            PhoneCode = model.PhoneCode;
            Phone = model.Phone;
            UserId = model.UserId;
        }
    }
}
